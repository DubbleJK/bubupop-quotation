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

function percentText(rate: number | undefined): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "";
  return String(Math.round(rate * 1000) / 10);
}

function purchaseLabel(unit: string): string {
  return purchaseUnits.find((option) => option.value === unit)?.label ?? unit;
}

function usageLabel(unit: string): string {
  return usageUnits.find((option) => option.value === unit)?.short ?? unit;
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
    setMessage("저장했습니다. 고객 화면 가격은 바뀌지 않았습니다.");
  };

  if (tab === "sale") return null;
  if (!library) return <p className="p-6 text-sm text-slate-500">원가 자료를 불러오는 중입니다.</p>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">
        순서는 세 단계입니다. 원자재 가격을 적고, 추가 공정 가격을 적은 다음, 품목에 필요한 것만 붙여 견적을 봅니다.
        여기서 만든 견적은 고객 화면 가격을 자동으로 바꾸지 않습니다.
        {source === "unconfigured" ? " 이 컴퓨터에는 저장소가 연결되지 않았습니다." : ""}
        {source === "empty" ? " 아직 저장된 내용이 없습니다." : ""}
        {message ? ` ${message}` : ""}
      </p>
      {tab === "materials" && <MaterialsPanel library={library} setLibrary={setLibrary} />}
      {tab === "processes" && <ProcessesPanel library={library} setLibrary={setLibrary} />}
      {tab === "products" && <ProductsPanel library={library} setLibrary={setLibrary} />}
      {tab === "history" && <HistoryPanel library={library} />}
      {tab !== "deploy" && tab !== "history" && tab !== "profit" && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중" : "이 내용 저장"}
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
        <h2 className="text-sm font-semibold text-slate-800">1. 원자재 가격</h2>
        <button type="button" onClick={add} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5">
          원자재 추가
        </button>
      </div>
      <p className="text-sm text-slate-600">필름, 원단, 티셔츠 같은 재료를 얼마에 샀는지 적습니다. 품목에 붙이기 전에는 견적에 들어가지 않습니다.</p>
      {library.materials.length === 0 && <p className="text-sm text-slate-500">아직 적은 원자재가 없습니다.</p>}
      {library.materials.map((row) => (
        <article key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              이름
              <input className={fieldClass} placeholder="예: DTF 필름" value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              어떤 재료인지
              <input className={fieldClass} placeholder="예: 필름" value={row.kind} onChange={(e) => update(row.id, { kind: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              규격 메모
              <input className={fieldClass} placeholder="예: 폭 60cm" value={row.spec} onChange={(e) => update(row.id, { spec: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="어떻게 샀나" value={row.purchaseUnit} options={purchaseUnits} onChange={(purchaseUnit) => update(row.id, { purchaseUnit: purchaseUnit as PurchaseUnit })} />
            <Select label="견적에서 세는 단위" value={row.usageUnit} options={usageUnits} onChange={(usageUnit) => update(row.id, { usageUnit: usageUnit as UsageUnit })} />
          </div>
          {row.purchaseUnit === row.usageUnit ? (
            <p className="text-xs text-slate-500">산 단위와 견적 단위가 같아서, 가격을 나누지 않습니다.</p>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
              {purchaseLabel(row.purchaseUnit)} 1개에 들어 있는 {usageLabel(row.usageUnit)}
              <input
                className={fieldClass}
                type="number"
                placeholder="예: 롤이면 50"
                value={row.conversion ?? ""}
                onChange={(e) => update(row.id, { conversion: optionalNumber(e.target.value), conversionStatus: e.target.value.trim() === "" ? "unconfirmed" : "confirmed" })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
            버리는 비율 (%)
            <input
              className={fieldClass}
              type="number"
              step="0.1"
              placeholder="안 버리면 0, 5%면 5"
              value={percentText(row.wasteRate)}
              onChange={(e) => {
                const percent = optionalNumber(e.target.value);
                update(row.id, {
                  wasteRate: percent == null ? undefined : percent / 100,
                  wasteStatus: percent == null ? "unconfirmed" : "confirmed",
                });
              }}
            />
          </label>
          <AmountFields
            title="산 가격"
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
        <h2 className="text-sm font-semibold text-slate-800">2. 추가 공정 가격</h2>
        <button type="button" onClick={add} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5">
          공정 추가
        </button>
      </div>
      <p className="text-sm text-slate-600">인쇄, 열프레스, 커팅, 포장처럼 재료 외에 드는 비용을 적습니다. 품목에 붙이기 전에는 견적에 들어가지 않습니다.</p>
      {library.processes.length === 0 && <p className="text-sm text-slate-500">아직 적은 공정이 없습니다.</p>}
      {library.processes.map((row) => (
        <article key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              이름
              <input className={fieldClass} value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
            </label>
            <Select label="비용을 어떻게 매기나" value={row.method} options={chargeMethods} onChange={(method) => update(row.id, { method: method as ChargeMethod })} />
          </div>
          {row.method !== "per-order" && row.method !== "per-minute" && row.variable && (
            <AmountFields title="이 공정 가격" price={row.variable} onChange={(variable) => update(row.id, { variable })} />
          )}
          {(row.method === "per-order" || row.method === "setup-plus-qty" || row.method === "per-minute") && (
            <AmountFields
              title="주문마다 한 번 드는 기본비"
              price={row.setup ?? blankAmount("krw-per-order", seoulToday())}
              onChange={(setup) => update(row.id, { setup })}
            />
          )}
          {row.method === "per-minute" && (
            <div className="space-y-3">
              <AmountFields
                title="1분에 드는 인건비"
                price={row.laborPerMin ?? blankAmount("krw-per-min", seoulToday())}
                onChange={(laborPerMin) => update(row.id, { laborPerMin })}
              />
              <AmountFields
                title="1분에 드는 기계비"
                price={row.equipmentPerMin ?? blankAmount("krw-per-min", seoulToday())}
                onChange={(equipmentPerMin) => update(row.id, { equipmentPerMin })}
              />
              <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
                한 번에 걸리는 시간 (분)
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
      <h2 className="text-sm font-semibold text-slate-800">3. 품목에 붙여 견적 내기</h2>
      <p className="text-sm text-slate-600">앞에서 적어 둔 원자재와 공정 중에서, 이 품목에 필요한 것만 붙입니다. 같은 공정을 두 번 붙여도 됩니다.</p>
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
              {row.legacyQuoteId ? " · 고객 화면에 있음" : ""}
            </option>
          ))}
        </select>
      </label>
      {recipe && (
        <article className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            {recipe.legacyQuoteId
              ? "이 품목은 이미 고객 화면에 있습니다. 여기서 조립한 견적은 비교용이고, 고객 화면 가격은 그대로입니다."
              : "새로 만든 품목은 고객 화면에 아직 나오지 않습니다."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PercentField label="최소로 남길 이익 (%)" value={margin?.minimumRate} onChange={(minimumRate) => patchMargin({ minimumRate })} />
            <PercentField label="보통 남길 이익 (%)" value={margin?.targetRate} onChange={(targetRate) => patchMargin({ targetRate })} />
            <PercentField label="많이 남길 이익 (%)" value={margin?.highRate} onChange={(highRate) => patchMargin({ highRate })} />
          </div>
          <p className="text-xs text-slate-500">25를 입력하면 판매가의 25%가 이익입니다. 원가에 25%를 더하는 방식이 아닙니다. 비워 두면 그 가격은 계산하지 않습니다.</p>
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
                  떼기
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <AddLine
              label="원자재 붙이기"
              options={activeMaterials.map((row) => ({ value: row.id, label: row.label || row.id }))}
              onAdd={(refId) =>
                patchRecipe({
                  lines: [...recipe.lines, { lineId: newCostId("line"), refId, kind: "material", usage: "per-piece" }],
                })
              }
            />
            <AddLine
              label="공정 붙이기"
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
            나중에 고객 화면에도 이 품목을 준비
          </label>
          <p className="text-xs text-slate-500">지금 고객 화면의 8개 품목 가격은 이 체크와 상관없이 유지됩니다.</p>
          <QuotePanel library={library} setLibrary={setLibrary} productId={recipe.productId} />
        </article>
      )}
    </section>
  );
}

function QuotePanel({
  library,
  setLibrary,
  productId,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
  productId: string;
}) {
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
      setNote("견적을 계산하지 못했습니다. 붙인 항목의 가격이 비어 있는지 확인해 주세요.");
      return;
    }
    setResult(data.result);
    setSaleRevision(data.salePolicyRevision ?? null);
    setDrops(data.quantityDrops ?? []);
  };

  const approve = async () => {
    if (!result?.approvalAllowed || result.target?.supplyPrice == null) return;
    const accepted = window.confirm(
      `보통 판매가 ${won(result.target.supplyPrice)}을 이 품목 기록에만 남깁니다. 고객 화면 가격은 바뀌지 않습니다.`
    );
    if (!accepted) return;
    const res = await fetch("/api/admin/pricing-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, input: { productId, qty, widthMm, heightMm } }),
    });
    const data = (await res.json().catch(() => ({}))) as { library?: CostLibrary; error?: string };
    if (!res.ok || !data.library) {
      setNote("저장한 뒤에만 기록할 수 있습니다. 위의 저장을 먼저 눌러 주세요.");
      return;
    }
    setLibrary(data.library);
    setNote("보통 판매가를 기록했습니다. 고객 화면 가격은 그대로입니다.");
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
    setNote(res.ok ? "이 견적을 기록에 남겼습니다." : "기록을 저장하지 못했습니다.");
  };

  return (
    <section className="space-y-3 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-semibold text-slate-800">이 조립으로 견적 보기</h3>
      <div className="grid grid-cols-3 gap-3">
        <NumberField label="수량" value={qty} onChange={setQty} />
        <NumberField label="가로 mm" value={widthMm} onChange={setWidthMm} />
        <NumberField label="세로 mm" value={heightMm} onChange={setHeightMm} />
      </div>
      <p className="text-xs text-slate-500">길이가 필요하면 세로를 진행 방향으로 봅니다. 시트는 A4에 몇 장 들어가는지로 셉니다.</p>
      <button type="button" onClick={() => void run()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm">
        견적 계산
      </button>
      {note && <p className="text-sm text-slate-700">{note}</p>}
      {result && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          {result.lines.length === 0 && <p>아직 붙인 원자재나 공정이 없습니다.</p>}
          <ul className="space-y-1">
            {result.lines.map((line) => (
              <li key={line.lineId}>
                {line.name} · {line.usageQty ?? "—"}
                {line.unitLabel ?? ""} · {line.status === "missing" ? `가격을 낼 수 없음 (${line.reason})` : won(line.supplyCost)}
              </li>
            ))}
          </ul>
          {result.missing.length > 0 && (
            <p className="text-red-700">가격이 비어 있어 판매가를 만들지 않습니다. {result.missing.join(", ")}</p>
          )}
          {result.supplyCost != null && <p>만든 원가 {won(result.supplyCost)}. 이 중 수량에 따라 늘어나는 비용 {won(result.variableCost)}, 주문마다 한 번인 비용 {won(result.fixedCost)}.</p>}
          <Band title="최소로 팔 가격" band={result.minimum} />
          <Band title="보통 판매가" band={result.target} />
          <Band title="여유 있게 팔 가격" band={result.high} />
          {result.minimumSalePrice != null && <p>이 품목에 정해 둔 최저 판매가까지 반영하면 {won(result.minimumSalePrice)}</p>}
          {result.current && (
            <p>
              지금 고객 화면 {result.current.label} {result.current.error ?? won(result.current.supplyPrice)}
              {result.current.finalPrice != null ? ` · 화면 최종가 ${won(result.current.finalPrice)}` : ""}
              {result.deltaSupply != null ? ` · 보통 판매가와 차이 ${won(result.deltaSupply)}` : ""}
            </p>
          )}
          {result.contribution != null && (
            <p>고객 화면 가격에서 늘어나는 비용을 빼면 {won(result.contribution)} 남습니다 ({pct(result.contributionMargin)}).</p>
          )}
          {result.belowTarget && <p className="text-amber-800">지금 고객 화면 가격이 보통 판매가보다 낮습니다. 화면 가격은 바꾸지 않습니다.</p>}
          {result.referenceSimulation && <p>아직 확인하지 않은 참고 금액이 있어, 이 판매가를 확정 기록할 수 없습니다.</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={!result.approvalAllowed} onClick={() => void approve()} className="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-40">
              보통 판매가만 기록
            </button>
            <button type="button" onClick={() => void record()} className="border border-slate-300 rounded-lg px-3 py-1.5">
              이 견적을 기록에 남기기
            </button>
          </div>
          {drops.length > 0 && (
            <p className="text-xs text-amber-800">
              개수가 늘면 고객 화면 금액이 내려가는 구간이 있습니다. 예: {drops[0]?.qty}개 {won(drops[0]?.price)}. 그 가격은 여기서 고치지 않습니다.
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
      {entries.length === 0 && <p className="text-sm text-slate-500">남긴 견적이 없습니다. 품목 조립에서 견적을 계산한 뒤 기록하면 여기에 남습니다.</p>}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="bg-white border border-slate-200 rounded-xl p-3 text-sm">
            <p>
              {entry.createdAt} · {library.recipes.find((row) => row.productId === entry.productId)?.label ?? entry.productId}
            </p>
            <p>그때 고객에게 보인 가격 {won(entry.presentedSupplyPrice)}</p>
            <p className="text-xs text-slate-500">
              그때 원가 {won(entry.internal?.supplyCost)} · 그때 보통 판매가 {won(entry.internal?.targetSupplyPrice)}
              {entry.internal?.missing?.length ? ` · 미등록 ${entry.internal.missing.join(", ")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AmountFields({
  title = "가격",
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
      <Select label="이 금액은" value={price.unit} options={costUnits} onChange={(unit) => onChange({ ...price, unit: unit as CostUnit })} />
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
        가격 시작일
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

function PercentField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input className={fieldClass} type="number" step="1" value={percentText(value)} onChange={(e) => {
        const percent = optionalNumber(e.target.value);
        onChange(percent == null ? undefined : percent / 100);
      }} />
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
  { value: "roll", label: "롤로 구매" },
  { value: "box", label: "상자로 구매" },
  { value: "m", label: "미터로 구매" },
  { value: "m2", label: "제곱미터로 구매" },
  { value: "sheet", label: "장으로 구매" },
  { value: "ea", label: "개로 구매" },
];
const usageUnits = [
  { value: "m", label: "미터로 계산", short: "미터" },
  { value: "m2", label: "제곱미터로 계산", short: "제곱미터" },
  { value: "sheet", label: "장으로 계산", short: "장" },
  { value: "ea", label: "개로 계산", short: "개" },
];
const costUnits = [
  { value: "krw-per-m", label: "1미터 가격" },
  { value: "krw-per-m2", label: "1제곱미터 가격" },
  { value: "krw-per-sheet", label: "1장 가격" },
  { value: "krw-per-ea", label: "1개 가격" },
  { value: "krw-per-min", label: "1분 가격" },
  { value: "krw-per-order", label: "주문 1건 가격" },
];
const chargeMethods = [
  { value: "per-ea", label: "한 개마다" },
  { value: "per-sheet", label: "한 장마다" },
  { value: "per-m", label: "1미터마다" },
  { value: "per-m2", label: "1제곱미터마다" },
  { value: "per-minute", label: "작업 시간으로" },
  { value: "per-order", label: "주문 한 건에 한 번" },
  { value: "setup-plus-qty", label: "기본비 + 개당" },
];
const usageOptions = [
  { value: "per-order", label: "주문마다 1번" },
  { value: "per-piece", label: "한 개마다" },
  { value: "per-meter-layout", label: "세로 길이만큼" },
  { value: "per-sheet-imposition", label: "시트 장수만큼" },
  { value: "per-m2", label: "면적만큼" },
];
