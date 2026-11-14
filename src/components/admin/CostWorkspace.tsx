"use client";

import { useEffect, useState } from "react";
import {
  blankAmount,
  newCostId,
  removeMaterial,
  removeProcess,
  seoulToday,
  upsertMargin,
} from "@/lib/cost/library";
import type { PricingResult } from "@/lib/cost/pricing";
import type {
  ChargeMethod,
  CostAmount,
  CostLibrary,
  CostUnit,
  MaterialCost,
  ProcessDef,
  ProductRecipe,
  PurchaseUnit,
  RecipeUsage,
  UsageUnit,
} from "@/lib/cost/types";

export type CostTab = "materials" | "processes" | "products" | "profit" | "history" | "deploy";

const fieldClass = "border border-slate-300 rounded px-2 py-1 text-sm";

function won(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function pct(rate: number | undefined): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function optionalNumber(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function CostWorkspace({ tab }: { tab: CostTab | "sale" }) {
  const [library, setLibrary] = useState<CostLibrary | null>(null);
  const [source, setSource] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/admin/cost-library");
      if (!res.ok) return;
      const data = (await res.json()) as { library: CostLibrary; source: string };
      if (cancelled) return;
      setLibrary(data.library);
      setSource(data.source);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!library) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/cost-library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; library?: CostLibrary };
    setSaving(false);
    if (!res.ok || !data.library) {
      setMessage(res.status === 503 ? "저장소가 연결되지 않아 서버에 남기지 못했습니다." : "저장하지 못했습니다.");
      return;
    }
    setLibrary(data.library);
    setSource("server");
    setMessage("원가 라이브러리를 저장했습니다. 고객 견적 판매가는 바뀌지 않았습니다.");
  };

  if (tab === "sale") return null;
  if (!library) return <p className="p-6 text-sm text-slate-500">원가 자료를 불러오는 중입니다.</p>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
        이 화면의 매입가·공정 원가·추천 판매가는 고객 견적에 자동으로 반영되지 않습니다.
        {source === "unconfigured" ? " 저장소가 아직 연결되지 않은 환경입니다." : ""}
        {source === "empty" ? " 저장된 원가 자료가 없어 빈 목록으로 시작합니다." : ""}
        {message ? ` ${message}` : ""}
      </p>
      {tab === "materials" && <MaterialsPanel library={library} setLibrary={setLibrary} />}
      {tab === "processes" && <ProcessesPanel library={library} setLibrary={setLibrary} />}
      {tab === "products" && <ProductsPanel library={library} setLibrary={setLibrary} />}
      {tab === "profit" && <ProfitPanel library={library} setLibrary={setLibrary} />}
      {tab === "history" && <HistoryPanel library={library} />}
      {tab === "deploy" && <DeployPanel />}
      {tab !== "deploy" && tab !== "history" && tab !== "profit" && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중" : "원가 자료 저장"}
        </button>
      )}
    </div>
  );
}

function MaterialsPanel({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const used = new Set(library.recipes.flatMap((recipe) => recipe.lines.filter((line) => line.kind === "material").map((line) => line.refId)));
  const add = () => {
    const row: MaterialCost = {
      id: newCostId("mat"),
      label: "",
      kind: "",
      spec: "",
      active: true,
      purchaseUnit: "ea",
      usageUnit: "ea",
      conversionStatus: "unconfirmed",
      price: blankAmount("krw-per-ea", seoulToday()),
      wasteStatus: "unconfirmed",
      history: [],
    };
    setLibrary({ ...library, materials: [...library.materials, row] });
  };
  const update = (id: string, patch: Partial<MaterialCost>) => {
    setLibrary({
      ...library,
      materials: library.materials.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">원자재</h2>
        <button type="button" onClick={add} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5">
          원자재 추가
        </button>
      </div>
      <p className="text-xs text-slate-500">빈 금액은 미등록입니다. 0을 입력하면 비용 없음으로 저장됩니다.</p>
      {library.materials.length === 0 && <p className="text-sm text-slate-500">등록된 원자재가 없습니다.</p>}
      {library.materials.map((row) => (
        <article key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              이름
              <input className={fieldClass} value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              종류
              <input className={fieldClass} value={row.kind} onChange={(e) => update(row.id, { kind: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              규격
              <input className={fieldClass} value={row.spec} onChange={(e) => update(row.id, { spec: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Select label="구매단위" value={row.purchaseUnit} options={purchaseUnits} onChange={(purchaseUnit) => update(row.id, { purchaseUnit: purchaseUnit as PurchaseUnit })} />
            <Select label="사용단위" value={row.usageUnit} options={usageUnits} onChange={(usageUnit) => update(row.id, { usageUnit: usageUnit as UsageUnit })} />
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              환산 수량
              <input
                className={fieldClass}
                type="number"
                value={row.conversion ?? ""}
                onChange={(e) => update(row.id, { conversion: optionalNumber(e.target.value), conversionStatus: e.target.value.trim() === "" ? "unconfirmed" : "confirmed" })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              로스율 (0.05 = 5%)
              <input
                className={fieldClass}
                type="number"
                step="0.01"
                value={row.wasteRate ?? ""}
                onChange={(e) => update(row.id, { wasteRate: optionalNumber(e.target.value), wasteStatus: e.target.value.trim() === "" ? "unconfirmed" : "confirmed" })}
              />
            </label>
          </div>
          <AmountFields
            price={row.price}
            onChange={(price) => update(row.id, { price })}
          />
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" className="text-slate-600" onClick={() => update(row.id, { active: !row.active })}>
              {row.active ? "비활성화" : "다시 활성화"}
            </button>
            <button
              type="button"
              className="text-red-700"
              onClick={() => {
                const next = removeMaterial(library, row.id);
                if (!next.ok) {
                  window.alert(next.error);
                  return;
                }
                setLibrary(next.library);
              }}
            >
              {used.has(row.id) ? "삭제 불가" : "삭제"}
            </button>
          </div>
          {row.history.length > 0 && (
            <p className="text-xs text-slate-500">이력 {row.history.length}건 · 최근 {row.history[row.history.length - 1]?.field}</p>
          )}
        </article>
      ))}
    </section>
  );
}

function ProcessesPanel({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const add = () => {
    const row: ProcessDef = {
      id: newCostId("proc"),
      label: "",
      active: true,
      method: "per-ea",
      variable: blankAmount("krw-per-ea", seoulToday()),
      history: [],
    };
    setLibrary({ ...library, processes: [...library.processes, row] });
  };
  const update = (id: string, patch: Partial<ProcessDef>) => {
    setLibrary({
      ...library,
      processes: library.processes.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">제작 공정</h2>
        <button type="button" onClick={add} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5">
          공정 추가
        </button>
      </div>
      <p className="text-xs text-slate-500">
        DTF 장비 참고값은 {won(library.equipment.find((row) => row.id === "dtf-equipment")?.price.amount)}/m, 상태 코드 참고값입니다. 판매단가로 쓰지 않습니다.
      </p>
      {library.processes.length === 0 && <p className="text-sm text-slate-500">등록된 공정이 없습니다.</p>}
      {library.processes.map((row) => (
        <article key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              이름
              <input className={fieldClass} value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
            </label>
            <Select label="비용 방식" value={row.method} options={chargeMethods} onChange={(method) => update(row.id, { method: method as ChargeMethod })} />
          </div>
          {row.method !== "per-order" && row.method !== "per-minute" && row.variable && (
            <AmountFields price={row.variable} onChange={(variable) => update(row.id, { variable })} />
          )}
          {(row.method === "per-order" || row.method === "setup-plus-qty" || row.method === "per-minute") && (
            <AmountFields
              title="세팅비"
              price={row.setup ?? blankAmount("krw-per-order", seoulToday())}
              onChange={(setup) => update(row.id, { setup })}
            />
          )}
          {row.method === "per-minute" && (
            <div className="space-y-3">
              <AmountFields
                title="분당 인건비"
                price={row.laborPerMin ?? blankAmount("krw-per-min", seoulToday())}
                onChange={(laborPerMin) => update(row.id, { laborPerMin })}
              />
              <AmountFields
                title="분당 장비비"
                price={row.equipmentPerMin ?? blankAmount("krw-per-min", seoulToday())}
                onChange={(equipmentPerMin) => update(row.id, { equipmentPerMin })}
              />
              <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
                작업시간 (분)
                <input
                  className={fieldClass}
                  type="number"
                  value={row.minutes?.value ?? ""}
                  onChange={(e) =>
                    update(row.id, {
                      minutes: {
                        value: optionalNumber(e.target.value),
                        per: row.minutes?.per ?? "ea",
                        status: e.target.value.trim() === "" ? "unconfirmed" : "confirmed",
                      },
                    })
                  }
                />
              </label>
            </div>
          )}
          <div className="flex gap-2 text-sm">
            <button type="button" className="text-slate-600" onClick={() => update(row.id, { active: !row.active })}>
              {row.active ? "비활성화" : "다시 활성화"}
            </button>
            <button
              type="button"
              className="text-red-700"
              onClick={() => {
                const next = removeProcess(library, row.id);
                if (!next.ok) {
                  window.alert(next.error);
                  return;
                }
                setLibrary(next.library);
              }}
            >
              삭제
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function ProductsPanel({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const [selected, setSelected] = useState(library.recipes[0]?.productId ?? "");
  const [name, setName] = useState("");
  const recipe = library.recipes.find((row) => row.productId === selected);
  const today = seoulToday();
  const margin = recipe ? upsertMargin(library, recipe.productId, today) : undefined;
  const activeMaterials = library.materials.filter((row) => row.active);
  const activeProcesses = library.processes.filter((row) => row.active);

  const patchRecipe = (patch: Partial<ProductRecipe>) => {
    if (!recipe) return;
    setLibrary({
      ...library,
      recipes: library.recipes.map((row) => (row.productId === recipe.productId ? { ...row, ...patch } : row)),
    });
  };
  const patchMargin = (patch: Partial<typeof margin>) => {
    if (!recipe || !margin) return;
    const next = { ...margin, ...patch };
    const exists = library.margins.some((row) => row.productId === recipe.productId);
    setLibrary({
      ...library,
      margins: exists
        ? library.margins.map((row) => (row.productId === recipe.productId ? { ...row, ...patch } : row))
        : [...library.margins, next],
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">판매 품목</h2>
      <div className="flex flex-wrap gap-2">
        <input className={fieldClass} placeholder="새 품목 이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          type="button"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          onClick={() => {
            const label = name.trim();
            if (!label) return;
            const productId = newCostId("item");
            setLibrary({
              ...library,
              recipes: [
                ...library.recipes,
                { productId, label, active: true, lines: [], showOnCustomerQuote: false },
              ],
            });
            setSelected(productId);
            setName("");
          }}
        >
          품목 추가
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
        품목
        <select className={fieldClass} value={selected} onChange={(e) => setSelected(e.target.value)}>
          {library.recipes.map((row) => (
            <option key={row.productId} value={row.productId}>
              {row.label || row.productId}
              {row.legacyQuoteId ? " · 기존 견적" : ""}
            </option>
          ))}
        </select>
      </label>
      {recipe && (
        <article className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-500">
            {recipe.legacyQuoteId
              ? "기존 8개 품목은 이 연결과 관계없이 지금 견적 화면의 판매가를 유지합니다."
              : "새 품목은 고객 견적 목록에 아직 나오지 않습니다."}
          </p>
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
            고정 판매 공급가
            <input
              className={fieldClass}
              type="number"
              value={recipe.fixedSupplyPrice ?? ""}
              onChange={(e) => patchRecipe({ fixedSupplyPrice: optionalNumber(e.target.value) })}
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RateField label="최소 이익률" value={margin?.minimumRate} onChange={(minimumRate) => patchMargin({ minimumRate })} />
            <RateField label="목표 이익률" value={margin?.targetRate} onChange={(targetRate) => patchMargin({ targetRate })} />
            <RateField label="높은 이익률" value={margin?.highRate} onChange={(highRate) => patchMargin({ highRate })} />
          </div>
          <p className="text-xs text-slate-500">이익률 0.25는 판매가의 25%입니다. 원가에 25%를 더하는 가산율이 아닙니다.</p>
          <ul className="space-y-2">
            {recipe.lines.map((line) => (
              <li key={line.lineId} className="flex flex-wrap gap-2 items-center text-sm">
                <span className="text-slate-700">
                  {line.kind === "material" ? "원자재" : "공정"} ·{" "}
                  {(line.kind === "material" ? library.materials : library.processes).find((row) => row.id === line.refId)?.label || line.refId}
                </span>
                <select
                  className={fieldClass}
                  value={line.usage}
                  onChange={(e) =>
                    patchRecipe({
                      lines: recipe.lines.map((item) =>
                        item.lineId === line.lineId ? { ...item, usage: e.target.value as RecipeUsage } : item
                      ),
                    })
                  }
                >
                  {usageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-red-700 text-xs"
                  onClick={() => patchRecipe({ lines: recipe.lines.filter((item) => item.lineId !== line.lineId) })}
                >
                  줄 삭제
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <AddLine
              label="원자재 줄 추가"
              options={activeMaterials.map((row) => ({ value: row.id, label: row.label || row.id }))}
              onAdd={(refId) =>
                patchRecipe({
                  lines: [...recipe.lines, { lineId: newCostId("line"), refId, kind: "material", usage: "per-piece" }],
                })
              }
            />
            <AddLine
              label="공정 줄 추가"
              options={activeProcesses.map((row) => ({ value: row.id, label: row.label || row.id }))}
              onAdd={(refId) =>
                patchRecipe({
                  lines: [...recipe.lines, { lineId: newCostId("line"), refId, kind: "process", usage: "per-piece" }],
                })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={recipe.showOnCustomerQuote}
              disabled={!recipe.approvedSupplyPrice && recipe.fixedSupplyPrice == null}
              onChange={(e) => patchRecipe({ showOnCustomerQuote: e.target.checked })}
            />
            고객 견적에 표시 준비
          </label>
          <p className="text-xs text-slate-500">
            승인된 가격 또는 고정 판매가가 있을 때만 켤 수 있습니다. 고객 견적 화면은 아직 기존 8개 계산을 사용합니다.
          </p>
        </article>
      )}
    </section>
  );
}

function ProfitPanel({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const [productId, setProductId] = useState(library.recipes[0]?.productId ?? "");
  const [qty, setQty] = useState(10);
  const [widthMm, setWidthMm] = useState(200);
  const [heightMm, setHeightMm] = useState(200);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [saleRevision, setSaleRevision] = useState<number | null>(null);
  const [drops, setDrops] = useState<{ qty: number; price: number; previous: number }[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setNote(null);
    const res = await fetch("/api/admin/pricing-simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library, input: { productId, qty, widthMm, heightMm } }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: PricingResult;
      salePolicyRevision?: number;
      quantityDrops?: { qty: number; price: number; previous: number }[];
      error?: string;
    };
    if (!res.ok || !data.result) {
      setNote("수익성을 계산하지 못했습니다.");
      return;
    }
    setResult(data.result);
    setSaleRevision(data.salePolicyRevision ?? null);
    setDrops(data.quantityDrops ?? []);
  };

  const approve = async () => {
    if (!result?.approvalAllowed || result.target?.supplyPrice == null) return;
    const accepted = window.confirm(
      `목표 판매 공급가 ${won(result.target.supplyPrice)}을 이 품목의 승인 기록으로 남깁니다. 고객 견적 판매가는 바뀌지 않습니다.`
    );
    if (!accepted) return;
    const res = await fetch("/api/admin/pricing-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, input: { productId, qty, widthMm, heightMm } }),
    });
    const data = (await res.json().catch(() => ({}))) as { library?: CostLibrary; error?: string };
    if (!res.ok || !data.library) {
      setNote("저장소에 있는 원가로 승인하지 못했습니다. 먼저 원가 자료를 저장하세요.");
      return;
    }
    setLibrary(data.library);
    setNote("승인 금액을 품목 기록에 남겼습니다. 고객 견적 판매가는 그대로입니다.");
  };

  const record = async () => {
    if (!result) return;
    const presented = result.current?.supplyPrice ?? result.target?.supplyPrice;
    if (presented == null) {
      setNote("이력에 남길 판매 공급가가 없습니다.");
      return;
    }
    const res = await fetch("/api/admin/quote-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry: {
          productId,
          input: { qty, widthMm, heightMm },
          salePolicyRevision: saleRevision ?? 0,
          costLibraryRevision: result.costLibraryRevision,
          marginPolicyRevision: 0,
          presentedSupplyPrice: presented,
          presentedVat: result.current?.vat ?? result.target?.vat ?? 0,
          presentedTotal: result.current?.total ?? result.target?.total ?? 0,
          internal: {
            supplyCost: result.supplyCost,
            minimumSupplyPrice: result.minimum?.supplyPrice,
            targetSupplyPrice: result.target?.supplyPrice,
            highSupplyPrice: result.high?.supplyPrice,
            profit: result.contribution,
            marginRate: result.contributionMargin,
            missing: result.missing,
          },
        },
      }),
    });
    setNote(res.ok ? "이 계산을 견적 이력에 남겼습니다." : "이력을 저장하지 못했습니다.");
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">수익성</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500 col-span-2">
          품목
          <select className={fieldClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            {library.recipes.map((row) => (
              <option key={row.productId} value={row.productId}>
                {row.label || row.productId}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="수량" value={qty} onChange={setQty} />
        <NumberField label="가로 mm" value={widthMm} onChange={setWidthMm} />
        <NumberField label="세로 mm" value={heightMm} onChange={setHeightMm} />
      </div>
      <p className="text-xs text-slate-500">배치 길이는 세로를 진행 방향으로 보고, 시트 매수는 A4 배치 수로 계산합니다.</p>
      <button type="button" onClick={() => void run()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm">
        수익성 계산
      </button>
      {note && <p className="text-sm text-slate-700">{note}</p>}
      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-sm">
          {result.lines.length === 0 && result.missing.includes("레시피 없음") && <p>레시피 없음</p>}
          {result.lines.length === 0 && !result.missing.includes("레시피 없음") && <p>연결된 원자재·공정이 없습니다.</p>}
          <ul className="space-y-1">
            {result.lines.map((line) => (
              <li key={line.lineId}>
                {line.name} · {line.usageQty ?? "—"}
                {line.unitLabel ?? ""} · {line.status === "missing" ? line.reason : won(line.supplyCost)}
              </li>
            ))}
          </ul>
          {result.missing.length > 0 && (
            <p className="text-red-700">미등록: {result.missing.join(", ")}. 추천 판매가는 비워 둡니다.</p>
          )}
          {result.supplyCost != null && <p>총제작원가 {won(result.supplyCost)} · 변동비 {won(result.variableCost)} · 고정비 {won(result.fixedCost)}</p>}
          <Band title="최소 수익성 가격" band={result.minimum} />
          <Band title="목표 판매가격" band={result.target} />
          <Band title="높은 수익성 가격" band={result.high} />
          <p>최소 판매가격 {won(result.minimumSalePrice)}</p>
          {result.current && (
            <p>
              현재 웹 견적 {result.current.label} {result.current.error ?? won(result.current.supplyPrice)}
              {result.current.finalPrice != null ? ` · UV 최종가 ${won(result.current.finalPrice)}` : ""}
              {result.deltaSupply != null ? ` · 목표와의 차액 ${won(result.deltaSupply)} (${pct(result.deltaRate)})` : ""}
            </p>
          )}
          {result.contribution != null && (
            <p>
              공헌이익 {won(result.contribution)} · 이익률 {pct(result.contributionMargin)}
            </p>
          )}
          {result.belowTarget && <p className="text-amber-800">목표 이익률 미달. 판매가는 바꾸지 않습니다.</p>}
          {result.referenceSimulation && <p>참고 시뮬레이션입니다. 코드 참고값만으로는 승인할 수 없습니다.</p>}
          <p className="text-xs text-slate-500">
            원가 개정 {result.costLibraryRevision} · 판매 개정 {saleRevision ?? "—"} · 이익률 적용일 {result.marginEffectiveFrom ?? "—"} · 부가세율 {result.vatRateUsed}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!result.approvalAllowed} onClick={() => void approve()} className="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-40">
              목표 가격 승인 기록
            </button>
            <button type="button" onClick={() => void record()} className="border border-slate-300 rounded-lg px-3 py-1.5">
              이 계산을 이력에 남기기
            </button>
          </div>
          {drops.length > 0 && (
            <p className="text-xs text-amber-800">
              수량이 늘면 표시 금액이 내려가는 구간이 있습니다. 예: {drops[0]?.qty}개 {won(drops[0]?.price)} (이전 {won(drops[0]?.previous)}). 기존 판매가는 그대로입니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryPanel({ library }: { library: CostLibrary }) {
  const [entries, setEntries] = useState<
    {
      id: string;
      createdAt: string;
      productId: string;
      presentedSupplyPrice: number;
      internal?: { supplyCost?: number; targetSupplyPrice?: number; missing: string[] };
    }[]
  >([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/quote-log");
      if (!res.ok) {
        setNote("이력을 불러오지 못했습니다.");
        return;
      }
      const data = (await res.json()) as { entries: typeof entries; source?: string };
      setEntries(data.entries ?? []);
      if (data.source === "unconfigured") setNote("저장소가 연결되지 않아 이력이 비어 있습니다.");
    })();
  }, []);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">견적 이력</h2>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      {entries.length === 0 && <p className="text-sm text-slate-500">남긴 계산이 없습니다. 수익성 화면에서 이력으로 저장합니다.</p>}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="bg-white border border-slate-200 rounded-xl p-3 text-sm">
            <p>
              {entry.createdAt} · {library.recipes.find((row) => row.productId === entry.productId)?.label ?? entry.productId}
            </p>
            <p>당시 판매 공급가 {won(entry.presentedSupplyPrice)}</p>
            <p className="text-xs text-slate-500">
              당시 원가 {won(entry.internal?.supplyCost)} · 당시 목표 추천가 {won(entry.internal?.targetSupplyPrice)}
              {entry.internal?.missing?.length ? ` · 미등록 ${entry.internal.missing.join(", ")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeployPanel() {
  const items = [
    "테스트와 빌드가 통과한 뒤에만 배포합니다.",
    "기존 8개 품목의 공급가와 총액이 기준선과 같은지 확인합니다.",
    "관리자 로그인 후에만 원가 화면이 열리는지 확인합니다. 공개 견적의 8개 금액은 그대로입니다.",
    "운영 판매 설정을 덮어쓰지 않습니다. 원가 자료는 별도 키에만 저장합니다.",
    "고객 견적은 기존 계산을 유지합니다. 추천가를 승인해도 판매 단가는 자동으로 바뀌지 않습니다.",
    "되돌릴 때는 직전 배포로 재배포합니다. 판매 설정 복구 쓰기는 하지 않습니다.",
  ];
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-semibold text-slate-800">배포 점검</h2>
      <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

function AmountFields({
  title = "매입가",
  price,
  onChange,
}: {
  title?: string;
  price: CostAmount;
  onChange: (next: CostAmount) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        {title}
        <input
          className={fieldClass}
          type="number"
          value={price.amount ?? ""}
          onChange={(e) => {
            const text = e.target.value;
            if (text.trim() === "") {
              const next = { ...price, status: "unconfirmed" as const };
              delete next.amount;
              onChange(next);
              return;
            }
            onChange({
              ...price,
              amount: Number(text),
              status: price.status === "code-reference" ? "code-reference" : "confirmed",
            });
          }}
        />
      </label>
      <Select label="단위" value={price.unit} options={costUnits} onChange={(unit) => onChange({ ...price, unit: unit as CostUnit })} />
      <Select
        label="부가세"
        value={price.tax}
        options={[
          { value: "exclusive", label: "별도" },
          { value: "inclusive", label: "포함" },
        ]}
        onChange={(tax) => onChange({ ...price, tax: tax as CostAmount["tax"] })}
      />
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        적용일
        <input className={fieldClass} type="date" value={price.effectiveFrom} onChange={(e) => onChange({ ...price, effectiveFrom: e.target.value })} />
      </label>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <select className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RateField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input className={fieldClass} type="number" step="0.01" value={value ?? ""} onChange={(e) => onChange(optionalNumber(e.target.value))} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input className={fieldClass} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Band({ title, band }: { title: string; band?: PricingResult["target"] }) {
  if (!band || (band.supplyPrice == null && !band.reason)) return <p>{title} —</p>;
  if (band.reason) return <p>{title}: {band.reason}</p>;
  return (
    <p>
      {title} {won(band.supplyPrice)} · 이익 {won(band.profit)} · 이익률 {pct(band.marginRate)} · 총액 {won(band.total)}
    </p>
  );
}

function AddLine({
  label,
  options,
  onAdd,
}: {
  label: string;
  options: { value: string; label: string }[];
  onAdd: (id: string) => void;
}) {
  const [value, setValue] = useState(options[0]?.value ?? "");
  return (
    <div className="flex gap-2 items-center">
      <select className={fieldClass} value={value} onChange={(e) => setValue(e.target.value)}>
        {options.length === 0 && <option value="">없음</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="button" className="text-sm border border-slate-300 rounded-lg px-3 py-1.5" disabled={!value} onClick={() => value && onAdd(value)}>
        {label}
      </button>
    </div>
  );
}

const purchaseUnits = [
  { value: "roll", label: "롤" },
  { value: "box", label: "박스" },
  { value: "m", label: "m" },
  { value: "m2", label: "㎡" },
  { value: "sheet", label: "장" },
  { value: "ea", label: "개" },
];
const usageUnits = [
  { value: "m", label: "m" },
  { value: "m2", label: "㎡" },
  { value: "sheet", label: "장" },
  { value: "ea", label: "개" },
];
const costUnits = [
  { value: "krw-per-m", label: "원/m" },
  { value: "krw-per-m2", label: "원/㎡" },
  { value: "krw-per-sheet", label: "원/장" },
  { value: "krw-per-ea", label: "원/개" },
  { value: "krw-per-min", label: "원/분" },
  { value: "krw-per-order", label: "원/주문" },
];
const chargeMethods = [
  { value: "per-ea", label: "개당" },
  { value: "per-sheet", label: "장당" },
  { value: "per-m", label: "m당" },
  { value: "per-m2", label: "㎡당" },
  { value: "per-minute", label: "작업시간당" },
  { value: "per-order", label: "주문당 고정" },
  { value: "setup-plus-qty", label: "세팅비 + 수량" },
];
const usageOptions = [
  { value: "per-order", label: "주문당" },
  { value: "per-piece", label: "개당" },
  { value: "per-meter-layout", label: "배치 길이(m)" },
  { value: "per-sheet-imposition", label: "시트 매수" },
  { value: "per-m2", label: "면적(㎡)" },
];
