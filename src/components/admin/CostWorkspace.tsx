"use client";

import { useEffect, useState, type ReactNode } from "react";
import { calcVatAndTotal } from "@/lib/calc/common";
import { formatSeoulMinute } from "@/lib/time/seoul";
import { getFileConfig } from "@/lib/config/fileConfig";
import {
  blankAmount,
  newCostId,
  duplicateRecipe,
  removeMaterial,
  removeProcess,
  seoulToday,
  upsertMargin,
} from "@/lib/cost/library";
import { clearBrowserDraft, parseCostLibraryDraft, readBrowserDraft, writeBrowserDraft } from "@/lib/cost/browserDraft";
import { CATALOG_PAGE_SIZE, PROCESS_CATEGORIES, RECENT_KEY, catalogPage, linkCount, matchesQuery, pickSuggestions, rememberId, sortByNameOrRecent } from "@/lib/cost/catalog";
import { DEFAULT_MINIMUM_RATE, DEFAULT_TARGET_RATE, simulatePricing, type PricingResult, type QtyCompareRow } from "@/lib/cost/pricing";
import { buildPublicCatalog, customerQuoteBlockReason, isListedOnCustomerHome } from "@/lib/cost/publicCatalog";
import { inferPriceBasis, usageUnitPrice } from "@/lib/cost/rollPrice";
import { quoteStage, quoteStageLabel, recipeIssues } from "@/lib/cost/recipeHealth";
import { CustomerMenuList } from "@/components/CustomerMenuList";
import type {
  ChargeMethod,
  CostAmount,
  CostLibrary,
  CostUnit,
  EquipmentCost,
  MaterialCost,
  ProcessDef,
  ProductGroup,
  ProductRecipe,
  PurchaseUnit,
  QtyPriceBand,
  RecipeUsage,
  UsageUnit,
} from "@/lib/cost/types";

export type CostTab = "materials" | "processes" | "products" | "quote" | "history" | "deploy";

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

function methodHint(method: string): string {
  if (method === "per-ea") return "예: 포장은 한 개마다 200원.";
  if (method === "per-sheet") return "예: 시트 커팅은 한 장마다 300원.";
  if (method === "per-m") return "예: DTF 출력은 1m마다 800원. 필름비는 원자재에 적습니다.";
  if (method === "per-m2") return "예: 넓은 출력은 1제곱미터마다 금액을 적습니다.";
  if (method === "per-minute") return "예: 1분 인건비와 기계비, 걸리는 시간을 적습니다.";
  if (method === "per-order") return "예: 디자인비는 주문 한 건에 8,000원. 최소 작업비보다 크면 최소 작업비를 더하지 않습니다.";
  return "예: 열프레스는 기본 준비비에 개당 작업비를 더합니다. 합계가 최소 작업비보다 작을 때만 최소 작업비로 맞춥니다.";
}

function usageHint(unit: string): string {
  if (unit === "ea") return "예: 면 티셔츠는 1개 가격을 적습니다.";
  if (unit === "m") return "예: DTF 필름은 롤을 샀어도 견적에서는 1m 가격으로 나눕니다.";
  if (unit === "sheet") return "예: 아트지는 A4 또는 A3 1장 가격을 적습니다.";
  if (unit === "m2") return "예: 원단은 1제곱미터 가격을 적습니다.";
  return "";
}

function costText(status: string, reason: string | undefined, amount: number | undefined): string {
  if (status === "missing" || amount == null) {
    if (!reason || reason.includes("미등록") || reason.includes("없습니다")) return "원가 미등록";
    return reason;
  }
  return won(amount);
}

export function CostWorkspace({
  tab,
  onDraftState,
}: {
  tab: CostTab | "sale";
  onDraftState?: (state: { dirty: boolean; source: string }) => void;
}) {
  const [library, setLibrary] = useState<CostLibrary | null>(null);
  const [source, setSource] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [browserBackup, setBrowserBackup] = useState<CostLibrary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/admin/cost-library");
      if (!res.ok) return;
      const data = (await res.json()) as { library: CostLibrary; source: string };
      if (cancelled) return;
      const draft = readBrowserDraft();
      if (data.source === "unconfigured" && draft) {
        setLibrary(draft);
        setSource("browser");
        return;
      }
      setLibrary(data.library);
      setSource(data.source);
      if (draft) setBrowserBackup(draft);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onDraftState?.({ dirty, source });
  }, [dirty, source, onDraftState]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const changeLibrary = (next: CostLibrary) => {
    setLibrary(next);
    setDirty(true);
    setSource((current) => {
      if (current === "unconfigured" || current === "browser") {
        writeBrowserDraft(next);
        return "browser";
      }
      return current;
    });
  };

  const save = async () => {
    if (!library) return;
    setSaving(true);
    setMessage(null);
    const localOnly = source === "unconfigured" || source === "browser";
    if (localOnly) writeBrowserDraft(library);
    const res = await fetch("/api/admin/cost-library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; library?: CostLibrary; source?: string };
    setSaving(false);
    if (!res.ok || !data.library) {
      setDirty(true);
      setMessage(
        data.source === "dev-file" || source === "dev-file" || source === "dev-empty"
          ? "개발 서버 저장에 실패했습니다. 저장된 것으로 보지 마세요."
          : localOnly
            ? "서버 저장에 실패했습니다. 이 컴퓨터에는 운영 저장소 주소가 없습니다. 다른 기기와 운영 사이트에는 저장되지 않았고, 브라우저 데이터를 지우면 사라집니다."
            : "서버 저장에 실패했습니다. 고객 판매가와 운영 데이터는 바꾸지 않았습니다."
      );
      return;
    }
    clearBrowserDraft();
    setBrowserBackup(null);
    setLibrary(data.library);
    setSource(data.source === "dev-file" || data.source === "dev-empty" ? "dev-file" : "server");
    setDirty(false);
    setMessage(
      data.source === "dev-file"
        ? "개발 서버 파일에 저장했습니다. 운영 저장소에는 넣지 않았고, 고객 판매가는 바꾸지 않았습니다."
        : "서버 저장소에 저장했습니다. 고객 화면 가격은 바뀌지 않았습니다."
    );
  };

  const downloadLibrary = (value: CostLibrary, filename: string) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (tab === "sale") return null;
  if (!library) return <p className="p-6 text-sm text-slate-500">원가 자료를 불러오는 중입니다.</p>;

  const serverSaved = source === "server" && !dirty;
  const devSaved = source === "dev-file" && !dirty;
  const storageText = serverSaved
    ? "운영 저장소에 저장되어 있습니다. 다른 기기에서도 같은 내용이 보입니다."
    : devSaved
      ? "이 개발 서버의 파일에 저장되어 있습니다. 이 컴퓨터의 다른 브라우저와, 같은 주소로 연 휴대폰에서는 보입니다. 운영 사이트에는 없습니다."
      : source === "dev-file"
        ? "개발 서버에 아직 반영하지 않은 변경이 있습니다. 저장에 성공하기 전에는 다른 브라우저에 없습니다."
        : source === "dev-empty"
          ? "개발 서버 파일 저장은 준비되어 있습니다. 아직 저장된 원가는 없습니다. 저장에 성공하기 전에는 보관된 것으로 보지 않습니다. 운영 사이트에는 저장되지 않습니다."
        : source === "empty"
          ? "운영 저장소는 연결되었고, 아직 저장된 원가가 없습니다. 저장이 성공하기 전에는 보관된 것으로 보지 않습니다."
          : source === "server"
            ? "운영 저장소에 아직 반영하지 않은 변경이 있습니다."
            : "운영 저장소가 연결되지 않았습니다. 지금 입력은 이 브라우저에만 있을 수 있습니다. 다른 기기와 운영 사이트에는 없고, 브라우저 데이터를 지우면 사라집니다.";

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className={`text-sm rounded-lg px-3 py-2 border ${source === "server" && !dirty ? "bg-white border-slate-200 text-slate-700" : "bg-amber-50 border-amber-200 text-amber-950"}`}>
        <p>원자재와 제작 공정을 먼저 등록하고, 판매 품목에 붙인 뒤 견적을 작성합니다. 여기서 만든 견적은 고객 화면 가격을 자동으로 바꾸지 않습니다.</p>
        <p className="mt-1">{storageText}</p>
        <p className="mt-1 font-medium">{serverSaved ? "저장 상태: 운영 서버에 저장됨" : devSaved ? "저장 상태: 개발 서버에 저장됨" : "저장 상태: 운영 서버에 저장되지 않음"}</p>
        {message && <p className="mt-1">{message}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="text-xs border border-slate-300 rounded px-2 py-1" onClick={() => downloadLibrary(library, "bubu-cost-backup.json")}>지금 화면을 파일로 받기</button>
          <label className="text-xs border border-slate-300 rounded px-2 py-1 cursor-pointer">
            파일에서 불러오기
            <input
              className="hidden"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void file.text().then((text) => {
                  const parsed = parseCostLibraryDraft(text);
                  if (!parsed) {
                    setMessage("가져올 수 없는 파일입니다.");
                    return;
                  }
                  setLibrary({ ...parsed, margins: parsed.margins ?? [], equipment: parsed.equipment ?? library.equipment });
                  setDirty(true);
                  setMessage("파일을 화면에 불러왔습니다. 저장을 눌러야 서버에 남고, 저장 전에는 고객 판매가가 바뀌지 않습니다.");
                });
              }}
            />
          </label>
        </div>
        {browserBackup && (
          <div className="mt-2 space-y-1">
            <p>이 브라우저에만 남아 있는 이전 입력이 있습니다. 브라우저 데이터를 지우면 사라집니다.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="text-xs border border-slate-300 rounded px-2 py-1" onClick={() => downloadLibrary(browserBackup, "bubu-browser-backup.json")}>브라우저 입력을 파일로 받기</button>
              <button
                type="button"
                className="text-xs border border-slate-300 rounded px-2 py-1"
                onClick={() => {
                  const replacing = library.materials.length > 0 || library.processes.length > 0;
                  if (replacing && !window.confirm("지금 화면의 원가를 이 브라우저에 있던 입력으로 바꿉니다. 저장을 눌러야 서버에 반영됩니다.")) return;
                  setLibrary(browserBackup);
                  setDirty(true);
                  setBrowserBackup(null);
                  setMessage("브라우저 입력을 화면에 불러왔습니다. 저장 전에는 서버에 올라가지 않습니다.");
                }}
              >
                브라우저 입력을 이 화면으로 불러오기
              </button>
            </div>
          </div>
        )}
      </div>
      {tab === "materials" && <MaterialsPanel library={library} setLibrary={changeLibrary} />}
      {tab === "processes" && <ProcessesPanel library={library} setLibrary={changeLibrary} />}
      {tab === "products" && <ProductsPanel library={library} setLibrary={changeLibrary} />}
      {tab === "quote" && <QuoteDesk library={library} setLibrary={changeLibrary} />}
      {tab === "history" && <HistoryPanel library={library} />}
      {tab !== "deploy" && tab !== "history" && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중" : source === "dev-file" || source === "dev-empty" ? "개발 서버에 저장" : "서버에 저장"}
        </button>
      )}
    </div>
  );
}

function TierEditor({
  title,
  hint,
  bands,
  onChange,
}: {
  title: string;
  hint: string;
  bands: QtyPriceBand[];
  onChange: (next: QtyPriceBand[]) => void;
}) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-700">{title}</summary>
      <p className="text-xs text-slate-500 mt-1">{hint}</p>
      <div className="space-y-2 mt-2">
        {bands.map((band, index) => (
          <div key={`${band.minQty}-${index}`} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input className={fieldClass} type="number" aria-label="시작 수량" value={band.minQty} onChange={(e) => onChange(bands.map((item, itemIndex) => itemIndex === index ? { ...item, minQty: optionalNumber(e.target.value) ?? 1 } : item))} />
            <input className={fieldClass} type="number" aria-label="끝 수량" placeholder="끝 수량, 없으면 비움" value={band.maxQty ?? ""} onChange={(e) => onChange(bands.map((item, itemIndex) => itemIndex === index ? { ...item, maxQty: optionalNumber(e.target.value) } : item))} />
            <input className={fieldClass} type="number" aria-label="개당 금액" placeholder="개당 금액" value={band.unitPrice} onChange={(e) => onChange(bands.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: optionalNumber(e.target.value) ?? 0 } : item))} />
            <button type="button" className="text-red-700 text-xs text-left" onClick={() => onChange(bands.filter((_, itemIndex) => itemIndex !== index))}>구간 빼기</button>
          </div>
        ))}
        <button type="button" className="text-sm border border-slate-300 rounded-lg px-3 py-1.5" onClick={() => onChange([...bands, { minQty: 1, unitPrice: 0 }])}>
          구간 추가
        </button>
      </div>
    </details>
  );
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(rememberId(readRecent(), id)));
}

function usagePriceLabel(row: MaterialCost): string {
  const priced = usageUnitPrice(row, 0.1, row.price.effectiveFrom || "2099-01-01");
  if (priced.amount == null) return priced.reason ?? "미확정";
  const withWaste = typeof row.wasteRate === "number" && row.wasteRate >= 0 && row.wasteRate < 1 ? priced.amount / (1 - row.wasteRate) : priced.amount;
  return `${Math.round(withWaste).toLocaleString("ko-KR")}원`;
}

function moneyLabel(price?: CostAmount): string {
  if (!price || price.status === "unconfirmed" || typeof price.amount !== "number") return "원가 미등록";
  return won(price.amount);
}

function processPriceLabel(row: ProcessDef): string {
  if (row.method === "per-order" && typeof row.setup?.amount === "number" && row.setup.status !== "unconfirmed") {
    return `${won(row.setup.amount)} / 주문`;
  }
  if (row.variable && row.variable.status !== "unconfirmed" && typeof row.variable.amount === "number") return won(row.variable.amount);
  if (typeof row.setup?.amount === "number" && row.setup.status !== "unconfirmed") return `${won(row.setup.amount)} / 주문`;
  return "원가 미등록";
}

function EditorModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-end sm:items-center justify-center p-2" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button type="button" className="text-sm border border-slate-300 rounded-lg px-3 py-1.5" onClick={onClose}>닫기</button>
        </div>
        {children}
      </div>
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
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const used = new Set(library.recipes.flatMap((recipe) => recipe.lines.filter((line) => line.kind === "material").map((line) => line.refId)));
  const kinds = [...new Set(library.materials.map((row) => row.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const filtered = sortByNameOrRecent(
    library.materials.filter((row) => (kind ? row.kind === kind : true) && matchesQuery(row.label, row.spec, query)),
    sortMode
  );
  const view = catalogPage(filtered, page);
  const editing = library.materials.find((row) => row.id === editingId);
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
      updatedAt: new Date().toISOString(),
      history: [],
    };
    setLibrary({ ...library, materials: [row, ...library.materials] });
    setEditingId(row.id);
    setPage(1);
  };
  const update = (id: string, patch: Partial<MaterialCost>) => {
    setLibrary({
      ...library,
      materials: library.materials.map((row) => (row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row)),
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">1. 원자재 관리</h2>
        <button type="button" onClick={add} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5">원자재 추가</button>
      </div>
      <p className="text-sm text-slate-600">목록에서 찾고, 수정은 한 건씩 엽니다. 품목에 붙은 원자재는 삭제하지 않고 비활성화합니다.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className={fieldClass} placeholder="이름 또는 규격 검색" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <select className={fieldClass} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          <option value="">분류 전체</option>
          {kinds.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className={fieldClass} value={sortMode} onChange={(e) => setSortMode(e.target.value as "recent" | "name")}>
          <option value="recent">최근 수정순</option>
          <option value="name">이름순</option>
        </select>
      </div>
      <p className="text-xs text-slate-500">{view.total}개 중 {view.total === 0 ? 0 : view.start + 1}–{Math.min(view.start + CATALOG_PAGE_SIZE, view.total)}개</p>
      {view.rows.length === 0 && <p className="text-sm text-slate-500">찾는 원자재가 없습니다.</p>}
      <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {view.rows.map((row) => (
          <li key={row.id} className={`p-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 text-sm ${row.active ? "" : "opacity-60"}`}>
            <div>
              <p className="font-medium text-slate-800">{row.label || "이름 없음"} {row.favorite ? "★" : ""} {!row.active && <span className="text-xs text-slate-500">비활성</span>}</p>
              <p className="text-xs text-slate-500">{row.spec || "규격 없음"} · 구매 {moneyLabel(row.price)} {inferPriceBasis(row) === "per-usage" ? "원/사용단위" : "원/구매단위"} · 견적 단가 {usagePriceLabel(row)} · 연결 {linkCount(library, "material", row.id)}개</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="text-xs border border-slate-300 rounded px-2 py-1" onClick={() => update(row.id, { favorite: !row.favorite })}>{row.favorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
              <button type="button" className="text-xs border border-slate-300 rounded px-2 py-1" onClick={() => setEditingId(row.id)}>수정</button>
              <button type="button" className="text-xs text-slate-600" onClick={() => update(row.id, { active: !row.active })}>{row.active ? "비활성화" : "다시 활성화"}</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-sm">
        <button type="button" className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>이전</button>
        <span>{view.page} / {view.pages}</span>
        <button type="button" className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40" disabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>다음</button>
      </div>
      {editing && (
        <EditorModal title={editing.label || "원자재 수정"} onClose={() => setEditingId(null)}>
          <MaterialFields row={editing} update={(patch) => update(editing.id, patch)} />
          {!used.has(editing.id) && (
            <button type="button" className="text-sm text-red-700" onClick={() => {
              const next = removeMaterial(library, editing.id);
              if (!next.ok) { window.alert(next.error); return; }
              setLibrary(next.library);
              setEditingId(null);
            }}>이 원자재 삭제</button>
          )}
          {used.has(editing.id) && <p className="text-xs text-slate-500">품목에 연결되어 있어 삭제하지 않습니다. 비활성화를 사용하세요.</p>}
        </EditorModal>
      )}
    </section>
  );
}

function RollCostPreview({ row }: { row: MaterialCost }) {
  const priced = usageUnitPrice(row, 0.1, row.price.effectiveFrom || "2099-01-01");
  const withWaste = priced.amount != null && typeof row.wasteRate === "number" && row.wasteRate >= 0 && row.wasteRate < 1
    ? priced.amount / (1 - row.wasteRate)
    : undefined;
  return (
    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
      <p>구매 방식: {inferPriceBasis(row) === "per-usage" ? "사용 단위 가격" : "구매 단위 전체 가격"}</p>
      <p>구매가격: {row.price.amount == null ? "미입력" : `${row.price.amount.toLocaleString("ko-KR")}원`} · 부가세 {row.price.tax === "inclusive" ? "포함" : "별도"}</p>
      <p>롤 길이 {row.rollLengthM ?? row.conversion ?? "—"}m · 롤 폭 {row.rollWidthMm ?? "—"}mm · 폐기율 {row.wasteRate == null ? "—" : `${Math.round(row.wasteRate * 1000) / 10}%`}</p>
      <p>환산 사용 단가 {priced.amount == null ? priced.reason ?? "—" : `${Math.round(priced.amount).toLocaleString("ko-KR")}원`}</p>
      <p>폐기율 적용 후 {withWaste == null ? "—" : `${Math.round(withWaste).toLocaleString("ko-KR")}원`}. 부가세는 한 번만 빼고, 폐기율도 한 번만 적용합니다. 저장된 금액은 여기서 바꾸지 않습니다.</p>
    </div>
  );
}

function MaterialFields({ row, update }: { row: MaterialCost; update: (patch: Partial<MaterialCost>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">이름 (필수)
          <input className={`${fieldClass} ${row.label.trim() ? "" : "border-amber-400"}`} placeholder="예: DTF 필름" value={row.label} onChange={(e) => update({ label: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">분류
          <input className={fieldClass} placeholder="예: 필름, 원단, 용지" value={row.kind} onChange={(e) => update({ kind: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">규격
          <input className={fieldClass} placeholder="예: 폭 850mm, 길이 100m" value={row.spec} onChange={(e) => update({ spec: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-md">가격 입력 단위
        <select className={fieldClass} value={inferPriceBasis(row)} onChange={(e) => update({ priceBasis: e.target.value === "per-usage" ? "per-usage" : "per-purchase" })}>
          <option value="per-purchase">{row.purchaseUnit === "roll" ? "롤 전체 가격 (원/롤)" : "구매 단위 전체 가격"}</option>
          <option value="per-usage">{row.usageUnit === "m" ? "미터 가격 (원/m)" : "사용 단위 가격"}</option>
        </select>
      </label>
      <AmountFields title={inferPriceBasis(row) === "per-usage" ? "구매가격 (원/사용단위)" : "구매가격 (원/구매단위)"} price={row.price} onChange={(price) => update({ price })} />
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">버리는 비율 (%) (필수)
        <input className={fieldClass} type="number" step="0.1" placeholder="안 버리면 0, 5%면 5" value={percentText(row.wasteRate)} onChange={(e) => {
          const percent = optionalNumber(e.target.value);
          update({ wasteRate: percent == null ? undefined : percent / 100, wasteStatus: percent == null ? "unconfirmed" : "confirmed" });
        }} />
      </label>
      <RollCostPreview row={row} />
      <details className="rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">고급 설정 · 규격과 환산</summary>
        <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="어떻게 샀나" value={row.purchaseUnit} options={purchaseUnits} onChange={(purchaseUnit) => update({ purchaseUnit: purchaseUnit as PurchaseUnit })} />
        <Select label="견적에서 세는 단위" value={row.usageUnit} options={usageUnits} onChange={(usageUnit) => update({ usageUnit: usageUnit as UsageUnit })} />
      </div>
      <p className="text-xs text-slate-500">{usageHint(row.usageUnit)}</p>
      {row.purchaseUnit === row.usageUnit ? (
        <p className="text-xs text-slate-500">산 단위와 견적 단위가 같아서, 가격을 나누지 않습니다.</p>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
          {purchaseLabel(row.purchaseUnit)} 1개에 들어 있는 {usageLabel(row.usageUnit)}
          <input className={fieldClass} type="number" placeholder="예: 롤이면 100" value={row.conversion ?? ""} onChange={(e) => update({ conversion: optionalNumber(e.target.value), conversionStatus: e.target.value.trim() === "" ? "unconfirmed" : "confirmed" })} />
        </label>
      )}
      {(row.purchaseUnit === "roll" || row.usageUnit === "m") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">롤 폭 (mm)
            <input className={fieldClass} type="number" placeholder="예: 600. 배치 견적에만 사용" value={row.rollWidthMm ?? ""} onChange={(e) => update({ rollWidthMm: optionalNumber(e.target.value) })} />
            <span>규격 글자와 별개입니다. 비우면 롤 배치 견적을 만들지 않습니다.</span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">롤 길이 (m)
            <input className={fieldClass} type="number" placeholder="기록용. 배치 길이 계산에는 쓰지 않음" value={row.rollLengthM ?? ""} onChange={(e) => update({ rollLengthM: optionalNumber(e.target.value) })} />
          </label>
        </div>
      )}
      {(row.purchaseUnit === "sheet" || row.usageUnit === "sheet") && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">판재 가로 (mm)
            <input className={fieldClass} type="number" placeholder="예: 1000" value={row.sheetWidthMm ?? ""} onChange={(e) => update({ sheetWidthMm: optionalNumber(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">판재 세로 (mm)
            <input className={fieldClass} type="number" placeholder="예: 500" value={row.sheetHeightMm ?? ""} onChange={(e) => update({ sheetHeightMm: optionalNumber(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">두께 (mm)
            <input className={fieldClass} type="number" placeholder="기록용" value={row.thicknessMm ?? ""} onChange={(e) => update({ thicknessMm: optionalNumber(e.target.value) })} />
          </label>
          <label className="sm:col-span-3 flex flex-col gap-1 text-xs text-slate-500 max-w-xs">판재 재료비
            <select className={fieldClass} value={row.sheetCharge ?? "full"} onChange={(e) => update({ sheetCharge: e.target.value === "share" ? "share" : "full" })}>
              <option value="full">판재 전체 사용</option>
              <option value="share">사용량 비례</option>
            </select>
          </label>
          <p className="sm:col-span-3 text-xs text-slate-500">여기 적은 가로·세로는 판재 원본입니다. 견적은 공통 여백 5mm를 사방에 한 번 뺍니다. 205×292처럼 이미 여백을 뺀 크기를 적으면 여백이 두 번 빠져 사용 영역이 195×282가 됩니다. 저장된 판재 크기는 바꾸지 않았습니다.</p>
        </div>
      )}
        <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">공급처
          <input className={fieldClass} placeholder="없으면 비움" value={row.supplier ?? ""} onChange={(e) => update({ supplier: e.target.value })} />
        </label>
        <TierEditor title="수량별 매입가" hint="예: 1~49개는 3,000원, 50~99개는 2,900원. 고객 판매 할인과 따로 계산합니다." bands={row.purchaseTiers ?? []} onChange={(purchaseTiers) => update({ purchaseTiers })} />
        </div>
      </details>
      <button type="button" className="text-sm text-slate-600" onClick={() => update({ active: !row.active })}>{row.active ? "비활성화" : "다시 활성화"}</button>
    </div>
  );
}

function ProcessesPanel({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const used = new Set(library.recipes.flatMap((recipe) => recipe.lines.filter((line) => line.kind === "process").map((line) => line.refId)));
  const filtered = sortByNameOrRecent(
    library.processes.filter((row) => (category ? row.category === category : true) && matchesQuery(row.label, row.category ?? "", query)),
    sortMode
  );
  const view = catalogPage(filtered, page);
  const editing = library.processes.find((row) => row.id === editingId);
  const add = () => {
    const row: ProcessDef = {
      id: newCostId("proc"),
      label: "",
      category: "",
      active: true,
      method: "per-ea",
      variable: blankAmount("krw-per-ea", seoulToday()),
      updatedAt: new Date().toISOString(),
      history: [],
    };
    setLibrary({ ...library, processes: [row, ...library.processes] });
    setEditingId(row.id);
    setPage(1);
  };
  const update = (id: string, patch: Partial<ProcessDef>) => {
    setLibrary({
      ...library,
      processes: library.processes.map((row) => (row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row)),
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">2. 제작 공정 관리</h2>
        <button type="button" onClick={add} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5">공정 추가</button>
      </div>
      <p className="text-sm text-slate-600">공정명으로 찾고, 상세 설정은 수정할 때만 엽니다. 품목에 붙은 공정은 삭제하지 않고 비활성화합니다.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className={fieldClass} placeholder="공정명 검색" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <select className={fieldClass} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">분류 전체</option>
          {PROCESS_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className={fieldClass} value={sortMode} onChange={(e) => setSortMode(e.target.value as "recent" | "name")}>
          <option value="recent">최근 수정순</option>
          <option value="name">이름순</option>
        </select>
      </div>
      <EquipmentSetup library={library} setLibrary={setLibrary} />
      <p className="text-xs text-slate-500">{view.total}개 중 {view.total === 0 ? 0 : view.start + 1}–{Math.min(view.start + CATALOG_PAGE_SIZE, view.total)}개</p>
      {view.rows.length === 0 && <p className="text-sm text-slate-500">찾는 공정이 없습니다.</p>}
      <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {view.rows.map((row) => (
          <li key={row.id} className={`p-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 text-sm ${row.active ? "" : "opacity-60"}`}>
            <div>
              <p className="font-medium text-slate-800">{row.label || "이름 없음"} {row.favorite ? "★" : ""} {!row.active && <span className="text-xs text-slate-500">비활성</span>}</p>
              <p className="text-xs text-slate-500">{row.category || "미분류"} · {row.equipmentId ? "장비 연결" : "장비 없음"} · {chargeMethods.find((item) => item.value === row.method)?.label ?? row.method} · {processPriceLabel(row)} · 연결 {linkCount(library, "process", row.id)}개 품목</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="text-xs border border-slate-300 rounded px-2 py-1" onClick={() => update(row.id, { favorite: !row.favorite })}>{row.favorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
              <button type="button" className="text-xs border border-slate-300 rounded px-2 py-1" onClick={() => setEditingId(row.id)}>수정</button>
              <button type="button" className="text-xs text-slate-600" onClick={() => update(row.id, { active: !row.active })}>{row.active ? "비활성화" : "다시 활성화"}</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-sm">
        <button type="button" className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>이전</button>
        <span>{view.page} / {view.pages}</span>
        <button type="button" className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40" disabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>다음</button>
      </div>
      {editing && (
        <EditorModal title={editing.label || "공정 수정"} onClose={() => setEditingId(null)}>
          <ProcessFields
            row={editing}
            equipment={library.equipment}
            update={(patch) => update(editing.id, patch)}
          />
          {!used.has(editing.id) && (
            <button type="button" className="text-sm text-red-700" onClick={() => {
              const next = removeProcess(library, editing.id);
              if (!next.ok) { window.alert(next.error); return; }
              setLibrary(next.library);
              setEditingId(null);
            }}>이 공정 삭제</button>
          )}
          {used.has(editing.id) && <p className="text-xs text-slate-500">품목에 연결되어 있어 삭제하지 않습니다. 비활성화를 사용하세요.</p>}
        </EditorModal>
      )}
    </section>
  );
}

function EquipmentSetup({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const [label, setLabel] = useState("");
  const update = (id: string, patch: Partial<EquipmentCost>) => {
    setLibrary({
      ...library,
      equipment: library.equipment.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
      <p className="text-sm font-medium text-slate-800">장비 준비비</p>
      <p className="text-xs text-slate-500">같은 장비를 쓰는 공정이 한 주문에 여러 개여도 준비비는 한 번만 계산합니다. 공정 기본비 칸에 같은 금액을 또 적지 마세요.</p>
      <div className="flex flex-wrap gap-2">
        <input className={fieldClass} placeholder="예: UV 출력기" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button
          type="button"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          onClick={() => {
            const name = label.trim();
            if (!name) return;
            const row: EquipmentCost = {
              id: newCostId("equip"),
              label: name,
              history: [],
              price: blankAmount("krw-per-order", seoulToday()),
              setup: blankAmount("krw-per-order", seoulToday()),
            };
            setLibrary({ ...library, equipment: [...library.equipment, row] });
            setLabel("");
          }}
        >
          장비 추가
        </button>
      </div>
      <ul className="space-y-2">
        {library.equipment.map((row) => (
          <li key={row.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <input className={fieldClass} aria-label="장비 이름" value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
            <label className="flex flex-col gap-1 text-xs text-slate-500">준비비 (원)
              <input
                className={fieldClass}
                type="number"
                placeholder="없으면 비움"
                value={row.setup?.amount ?? ""}
                onChange={(e) => update(row.id, {
                  setup: {
                    ...(row.setup ?? blankAmount("krw-per-order", seoulToday())),
                    amount: optionalNumber(e.target.value),
                    status: e.target.value.trim() === "" ? "unconfirmed" : "confirmed",
                  },
                })}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProcessFields({
  row,
  equipment,
  update,
}: {
  row: ProcessDef;
  equipment: EquipmentCost[];
  update: (patch: Partial<ProcessDef>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">이름 (필수)
          <input className={`${fieldClass} ${row.label.trim() ? "" : "border-amber-400"}`} placeholder="예: 열프레스" value={row.label} onChange={(e) => update({ label: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">분류
          <select className={fieldClass} value={row.category ?? ""} onChange={(e) => update({ category: e.target.value })}>
            <option value="">미분류</option>
            {PROCESS_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <Select label="비용을 어떻게 매기나" value={row.method} options={chargeMethods} onChange={(method) => update({ method: method as ChargeMethod })} />
      <p className="text-xs text-slate-500">{methodHint(row.method)}</p>
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">사용 장비
        <select className={fieldClass} value={row.equipmentId ?? ""} onChange={(e) => update({ equipmentId: e.target.value || undefined })}>
          <option value="">장비 없음. 이 공정 준비비만 계산</option>
          {equipment.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">등록된 비용 {processPriceLabel(row)}</p>
      <details className="rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer text-slate-700">최소 작업비 등 고급 설정</summary>
        <div className="mt-3 space-y-3">
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">최소 작업비 (원)
        <input className={fieldClass} type="number" placeholder="없으면 비움" value={row.minCharge ?? ""} onChange={(e) => update({ minCharge: optionalNumber(e.target.value) })} />
      </label>
      <p className="text-xs text-slate-500">준비비와 수량 작업비를 더한 뒤, 그 합이 최소 작업비보다 작을 때만 최소 작업비로 올립니다.</p>
        </div>
      </details>
      {row.method !== "per-order" && row.method !== "per-minute" && row.variable && (
        <AmountFields title="이 공정 가격" price={row.variable} onChange={(variable) => update({ variable })} />
      )}
      {(row.method === "per-order" || row.method === "setup-plus-qty" || row.method === "per-minute") && (
        <AmountFields title="주문마다 한 번 드는 기본비" price={row.setup ?? blankAmount("krw-per-order", seoulToday())} onChange={(setup) => update({ setup })} />
      )}
      {row.method === "per-minute" && (
        <div className="space-y-3">
          <AmountFields title="1분에 드는 인건비" price={row.laborPerMin ?? blankAmount("krw-per-min", seoulToday())} onChange={(laborPerMin) => update({ laborPerMin })} />
          <AmountFields title="1분에 드는 기계비" price={row.equipmentPerMin ?? blankAmount("krw-per-min", seoulToday())} onChange={(equipmentPerMin) => update({ equipmentPerMin })} />
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">한 번에 걸리는 시간 (분)
            <input className={fieldClass} type="number" value={row.minutes?.value ?? ""} onChange={(e) => update({
              minutes: { value: optionalNumber(e.target.value), per: row.minutes?.per ?? "ea", status: e.target.value.trim() === "" ? "unconfirmed" : "confirmed" },
            })} />
          </label>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-700">추가 설정</summary>
        <div className="space-y-3 mt-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">이 수량보다 많으면 확인
            <input className={fieldClass} type="number" placeholder="예: 500" value={row.reviewAboveQty ?? ""} onChange={(e) => update({ reviewAboveQty: optionalNumber(e.target.value) })} />
          </label>
          <TierEditor title="수량 구간 작업비" hint="구간 단가는 이 공정의 계산 단위당 금액입니다. 수량이 늘어도 단가가 오를 수 있습니다." bands={row.quantityBands ?? []} onChange={(quantityBands) => update({ quantityBands })} />
        </div>
      </details>
      <button type="button" className="text-sm text-slate-600" onClick={() => update({ active: !row.active })}>{row.active ? "비활성화" : "다시 활성화"}</button>
    </div>
  );
}
function RecipeLines({
  library,
  recipe,
  patchRecipe,
}: {
  library: CostLibrary;
  recipe: ProductRecipe;
  patchRecipe: (patch: Partial<ProductRecipe>) => void;
}) {
  const preview = simulatePricing(
    library,
    getFileConfig(),
    { productId: recipe.productId, qty: 1, widthMm: 100, heightMm: 100 },
    seoulToday()
  );
  const materialLines = preview.lines.filter((line) => line.kind === "material");
  const processLines = preview.lines.filter((line) => line.kind === "process");
  const sumOf = (lines: typeof preview.lines) =>
    lines.some((line) => line.status === "missing" || line.supplyCost == null)
      ? null
      : lines.reduce((sum, line) => sum + (line.supplyCost ?? 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">아래 금액은 1개, 가로 100mm, 세로 100mm 기준입니다. 다른 수량은 견적 계산에서 봅니다.</p>
      {recipe.lines.length === 0 && <p className="text-sm text-slate-500">아직 붙인 항목이 없습니다.</p>}
      {recipe.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2">이름</th>
                <th className="p-2">사용량</th>
                <th className="p-2">단위</th>
                <th className="p-2">원가</th>
                <th className="p-2">수정</th>
              </tr>
            </thead>
            <tbody>
              {recipe.lines.map((line) => {
                const priced = preview.lines.find((item) => item.lineId === line.lineId);
                const name = (line.kind === "material" ? library.materials : library.processes).find((row) => row.id === line.refId)?.label || line.refId;
                return (
                  <tr key={line.lineId} className="border-t border-slate-100">
                    <td className="p-2">
                      {name}
                      <span className="block text-xs text-slate-500">{line.kind === "material" ? "원자재" : "제작 공정"}</span>
                    </td>
                    <td className="p-2">{priced?.usageQty ?? "—"}</td>
                    <td className="p-2">{priced?.unitLabel ?? usageOptions.find((option) => option.value === line.usage)?.label}</td>
                    <td className="p-2">{costText(priced?.status ?? "missing", priced?.reason, priced?.supplyCost)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          className={fieldClass}
                          aria-label="계산 단위"
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
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <select
                          className={fieldClass}
                          aria-label="적용 옵션"
                          value={line.optionId ?? ""}
                          onChange={(e) =>
                            patchRecipe({
                              lines: recipe.lines.map((item) =>
                                item.lineId === line.lineId ? { ...item, optionId: e.target.value || undefined } : item
                              ),
                            })
                          }
                        >
                          <option value="">항상 포함</option>
                          {(recipe.options ?? []).map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                        {line.usage === "per-sheet-imposition" && (
                          <>
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              <input
                                type="checkbox"
                                checked={line.allowRotate !== false}
                                onChange={(e) =>
                                  patchRecipe({
                                    lines: recipe.lines.map((item) =>
                                      item.lineId === line.lineId ? { ...item, allowRotate: e.target.checked } : item
                                    ),
                                  })
                                }
                              />
                              90도 회전 허용
                            </label>
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              수동 한 장당
                              <input
                                className={`${fieldClass} w-16`}
                                type="number"
                                placeholder="자동"
                                value={line.manualPerSheet ?? ""}
                                onChange={(e) =>
                                  patchRecipe({
                                    lines: recipe.lines.map((item) =>
                                      item.lineId === line.lineId ? { ...item, manualPerSheet: optionalNumber(e.target.value) } : item
                                    ),
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                          적용 횟수
                          <input
                            className={`${fieldClass} w-16`}
                            type="number"
                            min={1}
                            value={line.times ?? 1}
                            onChange={(e) =>
                              patchRecipe({
                                lines: recipe.lines.map((item) =>
                                  item.lineId === line.lineId ? { ...item, times: optionalNumber(e.target.value) ?? 1 } : item
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-red-700 text-xs"
                          onClick={() => patchRecipe({ lines: recipe.lines.filter((item) => item.lineId !== line.lineId) })}
                        >
                          제거
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {recipe.lines.some((line) => line.usage === "per-piece") && (
        <p className="text-xs text-slate-500">개당 고정 사용량은 적용 횟수만큼만 씁니다. 가로·세로는 그 줄에 반영되지 않습니다.</p>
      )}
      {recipe.lines.some((line) => line.usage === "per-meter-layout") && (
        <p className="text-xs text-slate-500">롤 배치 사용량은 롤 폭, 가로, 세로, 간격이 모두 있어야 합니다. 하나라도 없으면 추천가를 만들지 않습니다.</p>
      )}
      <p className="text-sm text-slate-800">
        원자재 원가 {sumOf(materialLines) == null ? "원가 미등록" : won(sumOf(materialLines) ?? undefined)}
        {" · "}
        제작 공정 원가 {sumOf(processLines) == null ? "원가 미등록" : won(sumOf(processLines) ?? undefined)}
        {" · "}
        합계 {preview.missing.length > 0 ? "원가 미등록" : won(preview.supplyCost)}
      </p>
    </div>
  );
}

function ProductGroups({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const [label, setLabel] = useState("");
  const groups = [...(library.groups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"));
  const save = (next: ProductGroup[]) => setLibrary({ ...library, groups: next.map((row, index) => ({ ...row, sortOrder: index })) });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    save(next);
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
      <p className="text-sm font-medium text-slate-800">품목 그룹</p>
      <div className="flex flex-wrap gap-2">
        <input className={fieldClass} placeholder="예: 굿즈·아크릴" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button
          type="button"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          onClick={() => {
            const name = label.trim();
            if (!name) return;
            save([...groups, { id: newCostId("group"), label: name, sortOrder: groups.length, active: true }]);
            setLabel("");
          }}
        >
          그룹 추가
        </button>
      </div>
      {groups.length === 0 && <p className="text-xs text-slate-500">그룹이 없습니다. 스티커·라벨, 의류·DTF, 굿즈·아크릴처럼 나눠 둘 수 있습니다.</p>}
      <ul className="space-y-2">
        {groups.map((group, index) => (
          <li key={group.id} className={`flex flex-wrap items-center gap-2 text-sm ${group.active ? "" : "opacity-60"}`}>
            <input
              className={fieldClass}
              aria-label="그룹 이름"
              value={group.label}
              onChange={(e) => save(groups.map((row) => (row.id === group.id ? { ...row, label: e.target.value } : row)))}
            />
            <button type="button" className="text-xs text-slate-600" disabled={index === 0} onClick={() => move(index, -1)}>위로</button>
            <button type="button" className="text-xs text-slate-600" disabled={index === groups.length - 1} onClick={() => move(index, 1)}>아래로</button>
            <button
              type="button"
              className="text-xs text-slate-600"
              onClick={() => save(groups.map((row) => (row.id === group.id ? { ...row, active: !row.active } : row)))}
            >
              {group.active ? "비활성화" : "다시 사용"}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">그룹과 순서는 원가 저장소에 함께 저장됩니다. 다른 기기에서는 저장한 뒤에 같습니다.</p>
    </div>
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
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const recipe = library.recipes.find((row) => row.productId === selected);
  const visibleRecipes = [...library.recipes]
    .filter((row) => (groupFilter ? row.groupId === groupFilter : true))
    .filter((row) => (favoritesOnly ? row.favorite : true))
    .filter((row) => matchesQuery(row.label, row.legacyQuoteId ?? "", query))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label, "ko"));
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
      <h2 className="text-sm font-semibold text-slate-800">3. 판매 품목 관리</h2>
      <p className="text-sm text-slate-600">원자재와 공정을 품목에 붙입니다. 포장이나 양면처럼 고를 때만 쓰는 항목은 옵션에 연결하세요. 양면이라고 자동으로 두 배가 되지는 않습니다.</p>
      <ProductGroups library={library} setLibrary={setLibrary} />
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
                { productId, label, active: true, lines: [], showOnCustomerQuote: false, customerVisible: false },
              ],
              margins: [
                ...library.margins,
                {
                  productId,
                  minimumRate: DEFAULT_MINIMUM_RATE,
                  targetRate: DEFAULT_TARGET_RATE,
                  effectiveFrom: seoulToday(),
                  revision: 1,
                  history: [],
                },
              ],
            });
            setSelected(productId);
            setName("");
          }}
        >
          품목 추가
        </button>
        <button
          type="button"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          onClick={() => {
            if (!recipe) return;
            const next = duplicateRecipe(library, recipe.productId);
            if (!next) return;
            const created = next.recipes[next.recipes.length - 1];
            setLibrary(next);
            if (created) setSelected(created.productId);
          }}
        >
          이 품목 복제
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className={fieldClass} placeholder="품목 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={fieldClass} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">그룹 전체</option>
          {(library.groups ?? []).filter((group) => group.active).map((group) => (
            <option key={group.id} value={group.id}>{group.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
          자주 사용하는 품목
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-md">
        품목
        <select className={fieldClass} value={selected} onChange={(e) => setSelected(e.target.value)}>
          {visibleRecipes.map((row) => (
            <option key={row.productId} value={row.productId}>
              {row.favorite ? "★ " : ""}
              {row.label || row.productId}
              {row.legacyQuoteId ? (isListedOnCustomerHome(row) ? " · 고객 화면에 있음" : " · 첫 화면에서 숨김") : ""}
            </option>
          ))}
        </select>
      </label>
      {recipe && (
        <article className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            {recipe.legacyQuoteId
              ? "이 품목은 기존 고객 견적입니다. 첫 화면에서 숨겨도 계산식과 판매단가는 지워지지 않습니다."
              : "새로 만든 품목은 고객 견적 계산이 없어 첫 화면에 올리지 않습니다. 원가와 이익률도 고객에게 보이지 않습니다."}
          </p>
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-md">고객에게 보일 이름
            <input className={fieldClass} value={recipe.label} onChange={(e) => patchRecipe({ label: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">설명 (선택)
            <input className={fieldClass} placeholder="주문 조건 한 줄. 원가와 이익률은 적지 않습니다." value={recipe.description ?? ""} onChange={(e) => patchRecipe({ description: e.target.value })} />
          </label>
          <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-800 sm:grid-cols-2">
            <p>상태 {quoteStageLabel(quoteStage(library, recipe))}</p>
            <p>최소 판매금액 {recipe.minimumSupplyPrice == null ? "없음" : `${recipe.minimumSupplyPrice.toLocaleString("ko-KR")}원`}</p>
            <p>그룹 {(library.groups ?? []).find((group) => group.id === recipe.groupId)?.label ?? "그룹 없음"}</p>
            <p>직원 화면 {isListedOnCustomerHome(recipe) ? "표시" : "숨김"}</p>
            <p className="sm:col-span-2">연결 {recipe.lines.filter((line) => line.kind === "material").length}개 원자재 · {recipe.lines.filter((line) => line.kind === "process").length}개 공정</p>
            {recipeIssues(library, recipe).map((issue) => <p key={issue} className="sm:col-span-2 text-amber-800">{issue}</p>)}
          </div>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">이익률·옵션 고급 설정</summary>
            <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PercentField label="최소 확보 이익률 (%)" value={margin?.minimumRate ?? DEFAULT_MINIMUM_RATE} onChange={(minimumRate) => patchMargin({ minimumRate })} />
            <PercentField label="목표 이익률 (%)" value={margin?.targetRate ?? DEFAULT_TARGET_RATE} onChange={(targetRate) => patchMargin({ targetRate })} />
            <label className="flex flex-col gap-1 text-xs text-slate-500">그룹
              <select className={fieldClass} value={recipe.groupId ?? ""} onChange={(e) => patchRecipe({ groupId: e.target.value || undefined })}>
                <option value="">그룹 없음</option>
                {(library.groups ?? []).map((group) => (
                  <option key={group.id} value={group.id}>{group.label}{group.active ? "" : " · 비활성"}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">확정 판매가 (선택)
              <input className={fieldClass} type="number" placeholder="비워 두면 추천가만 계산" value={recipe.approvedSupplyPrice ?? ""} onChange={(e) => patchRecipe({ approvedSupplyPrice: optionalNumber(e.target.value) })} />
            </label>
          </div>
          <p className="text-xs text-slate-500">기본값은 최소 20%, 목표 35%입니다. 추천 공급가 = 총제작원가 ÷ (1 - 목표 이익률)입니다. 확정 판매가는 추천가와 다른 값이며, 고객 8개 화면 가격은 바꾸지 않습니다.</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={recipe.favorite === true} onChange={(e) => patchRecipe({ favorite: e.target.checked })} />
            자주 사용하는 품목
          </label>
          <div className="space-y-2">
            <p className="text-sm text-slate-700">주문 때 고르는 옵션</p>
            {(recipe.options ?? []).map((option) => (
              <div key={option.id} className="flex flex-wrap gap-2 items-center">
                <input
                  className={fieldClass}
                  aria-label="옵션 이름"
                  value={option.label}
                  onChange={(e) => patchRecipe({
                    options: (recipe.options ?? []).map((row) => (row.id === option.id ? { ...row, label: e.target.value } : row)),
                  })}
                />
                <button
                  type="button"
                  className="text-xs text-red-700"
                  onClick={() => patchRecipe({
                    options: (recipe.options ?? []).filter((row) => row.id !== option.id),
                    lines: recipe.lines.map((line) => (line.optionId === option.id ? { ...line, optionId: undefined } : line)),
                  })}
                >
                  옵션 삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
              onClick={() => patchRecipe({ options: [...(recipe.options ?? []), { id: newCostId("opt"), label: "새 옵션" }] })}
            >
              옵션 추가
            </button>
            <p className="text-xs text-slate-500">예: 단면·양면, 개별 OPP 포장, 선물 포장, 추가 디자인. 옵션에 연결한 줄만 선택했을 때 계산됩니다. 양면이 자동으로 두 배가 되지는 않습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-slate-600"
              onClick={() => moveRecipe(library, setLibrary, recipe.productId, -1)}
            >
              그룹 안에서 위로
            </button>
            <button
              type="button"
              className="text-xs text-slate-600"
              onClick={() => moveRecipe(library, setLibrary, recipe.productId, 1)}
            >
              그룹 안에서 아래로
            </button>
          </div>
            </div>
          </details>
          <RecipeLines library={library} recipe={recipe} patchRecipe={patchRecipe} />
          <div className="flex flex-wrap gap-2">
            <AddLine
              label="원자재 붙이기"
              options={activeMaterials.map((row) => ({ id: row.id, label: row.label || row.id, favorite: row.favorite }))}
              onAdd={(refId) => {
                pushRecent(refId);
                patchRecipe({
                  lines: [...recipe.lines, { lineId: newCostId("line"), refId, kind: "material", usage: "per-piece" }],
                });
              }}
            />
            <AddLine
              label="공정 붙이기"
              options={activeProcesses.map((row) => ({ id: row.id, label: row.label || row.id, favorite: row.favorite }))}
              onAdd={(refId) => {
                pushRecent(refId);
                patchRecipe({
                  lines: [...recipe.lines, { lineId: newCostId("line"), refId, kind: "process", usage: "per-piece" }],
                });
              }}
            />
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">상품 상태
            <select className={fieldClass} value={recipe.quoteStatus ?? quoteStage(library, recipe)} onChange={(e) => {
              const value = e.target.value;
              patchRecipe({ quoteStatus: value === "review" || value === "incomplete" || value === "ready" ? value : undefined });
            }}>
              <option value="ready">사용 가능</option>
              <option value="review">검증 중</option>
              <option value="incomplete">설정 필요</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">지금 상태: {quoteStageLabel(quoteStage(library, recipe))}. 설정 필요는 확정 견적으로 저장되지 않습니다. 기존 8개 품목은 상태를 지정하지 않으면 사용 가능입니다.</p>
          <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">최소 판매금액 (부가세 별도 공급가)
            <input className={fieldClass} type="number" placeholder="없으면 비움. 원가에 더하지 않습니다." value={recipe.minimumSupplyPrice ?? ""} onChange={(e) => patchRecipe({ minimumSupplyPrice: optionalNumber(e.target.value) })} />
          </label>
          {recipeIssues(library, recipe).map((issue) => <p key={issue} className="text-xs text-amber-800">{issue}</p>)}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isListedOnCustomerHome(recipe)}
              disabled={customerQuoteBlockReason(recipe) != null}
              onChange={(e) => patchRecipe({ customerVisible: e.target.checked, staffHidden: !e.target.checked })}
            />
            직원 견적 화면에 표시
          </label>
          {customerQuoteBlockReason(recipe) ? (
            <p className="text-xs text-amber-800">{customerQuoteBlockReason(recipe)}</p>
          ) : (
            <p className="text-xs text-slate-500">숨기면 직원 견적 목록에서 빠집니다. 기존 8개 계산식과 판매단가는 바뀌지 않습니다. 다른 기기는 저장한 뒤에 같아집니다.</p>
          )}
          {library.recipes.some((row) => row.productId !== recipe.productId && row.label.trim() !== "" && row.label.trim() === recipe.label.trim() && isListedOnCustomerHome(row) && isListedOnCustomerHome(recipe)) && (
            <p className="text-xs text-amber-800">같은 이름의 품목이 고객 화면에 이미 있습니다. 둘 다 보이면 손님에게 같은 메뉴가 두 번 나옵니다.</p>
          )}
        </article>
      )}
      <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">직원 견적 화면 미리보기</h3>
        <p className="text-xs text-slate-500">지금 화면의 공개 품목만 보여 줍니다. 다른 기기에는 서버에 저장한 뒤에 반영됩니다. 매입가와 이익률은 이 목록에 없습니다.</p>
        <CustomerMenuList catalog={buildPublicCatalog(library)} />
      </section>
    </section>
  );
}

function moveRecipe(
  library: CostLibrary,
  setLibrary: (next: CostLibrary) => void,
  productId: string,
  direction: -1 | 1
) {
  const current = library.recipes.find((row) => row.productId === productId);
  if (!current) return;
  const siblings = library.recipes
    .filter((row) => row.groupId === current.groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label, "ko"));
  const index = siblings.findIndex((row) => row.productId === productId);
  const neighbor = siblings[index + direction];
  if (!neighbor) return;
  const order = new Map(siblings.map((row, position) => [row.productId, position]));
  order.set(current.productId, index + direction);
  order.set(neighbor.productId, index);
  setLibrary({
    ...library,
    recipes: library.recipes.map((row) => (order.has(row.productId) ? { ...row, sortOrder: order.get(row.productId) } : row)),
  });
}

function QuoteDesk({
  library,
  setLibrary,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
}) {
  const [productId, setProductId] = useState(library.recipes[0]?.productId ?? "");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const recipe = library.recipes.find((row) => row.productId === productId);
  const visible = library.recipes.filter((row) => (groupFilter ? row.groupId === groupFilter : true) && matchesQuery(row.label, "", query));
  const shownLines = recipe?.lines.filter((line) => !line.optionId || optionIds.includes(line.optionId)) ?? [];
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">4. 견적 작성</h2>
      <p className="text-sm text-slate-600">그룹이나 검색으로 품목을 고른 뒤 규격, 수량, 옵션만 입력합니다. 고르지 않은 옵션의 재료와 공정은 계산하지 않습니다.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input className={fieldClass} placeholder="품목 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={fieldClass} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">그룹 전체</option>
          {(library.groups ?? []).filter((group) => group.active).map((group) => (
            <option key={group.id} value={group.id}>{group.label}</option>
          ))}
        </select>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
        품목
        <select className={fieldClass} value={productId} onChange={(e) => { setProductId(e.target.value); setOptionIds([]); }}>
          {visible.map((row) => (
            <option key={row.productId} value={row.productId}>{row.label || row.productId}</option>
          ))}
        </select>
      </label>
      {(recipe?.options ?? []).length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm text-slate-700">
          {(recipe?.options ?? []).map((option) => (
            <label key={option.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={optionIds.includes(option.id)}
                onChange={(e) => setOptionIds((current) => e.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
      {recipe && (
        <ul className="text-sm text-slate-600">
          {shownLines.length === 0 && <li>이 조건에 계산할 원자재와 공정이 없습니다.</li>}
          {shownLines.map((line) => (
            <li key={line.lineId}>
              {(line.kind === "material" ? library.materials : library.processes).find((row) => row.id === line.refId)?.label || line.refId}
              {" · "}
              {line.kind === "material" ? "원자재" : "공정"}
              {line.times && line.times !== 1 ? ` ${line.times}회` : ""}
            </li>
          ))}
        </ul>
      )}
      {productId && <QuotePanel library={library} setLibrary={setLibrary} productId={productId} optionIds={optionIds} />}
    </section>
  );
}

function QuotePanel({
  library,
  setLibrary,
  productId,
  optionIds,
}: {
  library: CostLibrary;
  setLibrary: (next: CostLibrary) => void;
  productId: string;
  optionIds: string[];
}) {
  const [qty, setQty] = useState(10);
  const [widthMm, setWidthMm] = useState(200);
  const [heightMm, setHeightMm] = useState(200);
  const [gapText, setGapText] = useState("");
  const [result, setResult] = useState<PricingResult | null>(null);
  const [saleRevision, setSaleRevision] = useState<number | null>(null);
  const [drops, setDrops] = useState<{ qty: number; price: number; previous: number }[]>([]);
  const [comparison, setComparison] = useState<QtyCompareRow[]>([]);
  const [qtyText, setQtyText] = useState("1, 10, 50, 100, 500");
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setNote(null);
    const res = await fetch("/api/admin/pricing-simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        library,
        input: { productId, qty, widthMm, heightMm, gapMm: gapText.trim() === "" ? undefined : Number(gapText), optionIds },
        qtys: qtyText.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item >= 1),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: PricingResult;
      comparison?: QtyCompareRow[];
      salePolicyRevision?: number;
      quantityDrops?: { qty: number; price: number; previous: number }[];
      error?: string;
    };
    if (!res.ok || !data.result) {
      setNote("견적을 계산하지 못했습니다. 붙인 항목의 가격이 비어 있는지 확인해 주세요.");
      return;
    }
    setResult(data.result);
    setComparison(data.comparison ?? []);
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
      body: JSON.stringify({ confirm: true, input: { productId, qty, widthMm, heightMm, gapMm: gapText.trim() === "" ? undefined : Number(gapText), optionIds } }),
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
    const presented = result.recommendedSupplyPrice ?? result.current?.supplyPrice ?? result.target?.supplyPrice;
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
          input: { qty, widthMm, heightMm, gapMm: gapText.trim() === "" ? undefined : Number(gapText), optionIds },
          salePolicyRevision: saleRevision ?? 0,
          costLibraryRevision: result.costLibraryRevision,
          marginPolicyRevision: 0,
          presentedSupplyPrice: presented,
          presentedVat: result.current?.vat ?? result.target?.vat ?? 0,
          presentedTotal: result.current?.total ?? result.target?.total ?? 0,
          internal: {
            supplyCost: result.supplyCost,
            minimumSupplyPrice: result.productMinimumSupply ?? result.minimum?.supplyPrice,
            recommendedSupplyPrice: result.recommendedSupplyPrice,
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumberField label="수량" value={qty} onChange={setQty} />
        <NumberField label="가로 mm" value={widthMm} onChange={setWidthMm} />
        <NumberField label="세로 mm" value={heightMm} onChange={setHeightMm} />
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">배치 간격 mm
        <input className={fieldClass} type="number" placeholder="롤 배치에만 필요. 비우면 배치 견적 없음" value={gapText} onChange={(e) => setGapText(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        비교할 수량
        <input className={fieldClass} value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
      </label>
      <p className="text-xs text-slate-500">개당 고정 사용량은 가로·세로를 쓰지 않습니다. 롤 배치는 롤 폭과 간격이 있을 때만 길이를 계산하고, 로스는 그 길이에 한 번만 적용합니다.</p>
      <button type="button" onClick={() => void run()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm">
        견적 계산
      </button>
      {note && <p className="text-sm text-slate-700">{note}</p>}
      {comparison.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2">수량</th>
                <th className="p-2">총제작원가</th>
                <th className="p-2">최종 추천 공급가</th>
                <th className="p-2">개당 공급가</th>
                <th className="p-2">목표 이익률</th>
                <th className="p-2">예상 이익률</th>
                <th className="p-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.qty} className={row.status === "inversion" ? "bg-amber-50" : undefined}>
                  <td className="p-2">{row.qty}개</td>
                  <td className="p-2">{won(row.supplyCost)}</td>
                  <td className="p-2">{won(row.recommendedSupply)}</td>
                  <td className="p-2">{won(row.unitSupply)}</td>
                  <td className="p-2">{pct(row.targetMarginRate)}</td>
                  <td className="p-2">{pct(row.marginRate)}</td>
                  <td className="p-2">{row.status === "ok" ? "정상" : row.status === "missing" ? "가격 없음" : row.status === "review" ? "관리자 확인 필요" : row.status === "low-margin" ? "최소 이익 미달" : "총액 역전"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result?.capacityWarning && <p className="text-sm text-amber-800">{result.capacityWarning}</p>}
      {result?.usesVirtualCost && <p className="text-xs text-slate-500">이 계산에는 가상 원가 또는 코드 참고값이 포함되어 있습니다.</p>}
      {comparison.length > 0 && <p className="text-xs text-slate-500">수량별 비교의 추천 공급가는 참고 가격입니다. 현재 고객 판매가와 다릅니다.</p>}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-800">원가</h3>
            {result.lines.length === 0 && <p>아직 붙인 원자재나 공정이 없습니다.</p>}
            <ul className="space-y-1">
              {result.lines.map((line) => (
                <li key={line.lineId}>
                  {line.kind === "material" ? "원자재" : "제작 공정"} · {line.name} · {line.usageQty ?? "—"}
                  {line.unitLabel ?? ""} · {costText(line.status, line.reason, line.supplyCost)}
                  {line.usageNote ? <span className="block text-xs text-slate-500">{line.usageNote}</span> : null}
                </li>
              ))}
            </ul>
            <p>원자재 원가 {kindSum(result, "material")}</p>
            <p>제작 공정 원가 {kindSum(result, "process")}</p>
            <p className="font-medium">총제작원가 {result.missing.length > 0 ? "원가 미등록" : won(result.supplyCost)}</p>
            {result.missing.length === 0 && result.supplyCost != null && qty > 0 && (
              <p>개당 제작원가 {won(Math.round(result.supplyCost / qty))}</p>
            )}
            {result.missing.length > 0 && <p className="text-red-700">빠진 항목: {result.missing.join(", ")}</p>}
            {result.warnings.map((warning) => <p key={warning} className="text-amber-800">{warning}</p>)}
          </section>
          <section className="bg-white border border-slate-300 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-800">현재 고객 판매가</h3>
            <p className="text-xs text-slate-500">수량 {qty}개 · 가로 {widthMm}mm · 세로 {heightMm}mm. 지금 고객 화면에 보이는 가격입니다. 추천가로 바뀌지 않습니다.</p>
            {result.current?.error ? (
              <p>{result.current.label}: {result.current.error}</p>
            ) : result.current?.supplyPrice == null ? (
              <p>기존 판매가 없음</p>
            ) : (
              <p>
                {result.current.label} {won(result.current.supplyPrice)}
                {result.current.finalPrice != null ? ` · 화면 최종가 ${won(result.current.finalPrice)}` : ""}
              </p>
            )}
          </section>
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-amber-950">내부 추천가격</h3>
            <p className="text-xs text-amber-900">고객 화면 가격이 아닙니다. 총제작원가 ÷ (1 - 목표 이익률)로 계산하고, 추천 공급가는 10원 단위로 올립니다. 고객 판매가는 바꾸지 않습니다.</p>
            {result.laborUnpriced && <p className="text-red-800">작업비가 빠져 있어 이 추천 공급가는 그대로 믿지 않습니다.</p>}
            <p className="text-xs text-amber-900">{result.profitBasis === "total-cost" ? "고정 작업비가 포함되어 있어 총제작원가 기준 이익률입니다. 공헌이익률이 아닙니다." : "고정 작업비가 없어 이 이익률은 공헌이익률과 같습니다."}</p>
            {result.missing.length > 0 ? (
              <p>원가가 빠져 추천가격을 만들지 않습니다.</p>
            ) : (
              <>
                <Band title="최소 확보 이익률 공급가" band={result.minimum} />
                <Band title="목표 이익률 기준 공급가" band={result.target} />
                <p>품목별 최소 공급가 {won(result.productMinimumSupply)}</p>
                <p className="text-base font-semibold">최종 추천 공급가 {won(result.recommendedSupplyPrice)}</p>
                {result.recommendedSupplyPrice != null && <p>최종 추천가 부가세 {won(calcVatAndTotal(result.recommendedSupplyPrice, result.vatRateUsed).vat)} · 결제금액 {won(calcVatAndTotal(result.recommendedSupplyPrice, result.vatRateUsed).total)}</p>}
                {result.recommendedSupplyPrice != null && result.supplyCost != null && result.recommendedSupplyPrice > 0 && (
                  <p>최종 추천가 기준 예상 이익률 {pct((result.recommendedSupplyPrice - result.supplyCost) / result.recommendedSupplyPrice)}</p>
                )}
                {result.target?.marginRate != null && <p>목표 이익률 {pct(result.target.marginRate)}</p>}
              </>
            )}
          </section>
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-800">현재 판매가의 이익</h3>
            {result.current?.supplyPrice == null ? (
              <p>기존 판매가 없음</p>
            ) : (
              <>
                <p>이익금 {won(result.currentProfit)} · 이익률 {pct(result.currentMarginRate)}</p>
                <p>부가세 {won(result.current.vat)} · 최종 총액 {won(result.current.total)}</p>
                {result.profitBasis === "total-cost" && result.contribution != null && (
                  <p className="text-xs text-slate-500">수량에 따라 늘어나는 원가만 빼면 공헌이익 {won(result.contribution)} ({pct(result.contributionMargin)})입니다.</p>
                )}
              </>
            )}
            {result.belowMinimum && <p className="text-amber-800">현재 판매가의 이익률이 최소 확보 이익률보다 낮습니다. 고객 판매가는 바꾸지 않습니다. 특별 주문은 여기서 가격을 검토하면 됩니다.</p>}
            {result.belowTarget && <p className="text-amber-800">현재 고객 판매가가 추천 공급가보다 낮습니다. 고객 판매가는 바꾸지 않습니다.</p>}
          </section>
          {result.referenceSimulation && <p className="md:col-span-2">아직 확인하지 않은 참고 금액이 있어, 이 추천가를 확정 기록할 수 없습니다.</p>}
          <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={!result.approvalAllowed} onClick={() => void approve()} className="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-40">
              추천 공급가만 기록
            </button>
            <button type="button" onClick={() => void record()} className="border border-slate-300 rounded-lg px-3 py-1.5">
              이 견적을 기록에 남기기
            </button>
          </div>
          {drops.length > 0 && (
            <p className="md:col-span-2 text-xs text-amber-800">
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
      presentedVat?: number;
      presentedTotal?: number;
      staffName?: string;
      customerName?: string;
      adjustmentReason?: string;
      input?: Record<string, number | string>;
      internal?: { supplyCost?: number; targetSupplyPrice?: number; recommendedSupplyPrice?: number; missing: string[] };
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
      if (data.source === "unconfigured") setNote("운영 저장소가 없어 견적 기록은 서버에 남지 않습니다. 다른 기기에서도 보이지 않습니다.");
      if (data.source === "dev-file") setNote("이 개발 서버에는 최근 200건만 남습니다. 더 오래된 기록은 자동으로 지워지고, 운영 사이트와는 따로입니다.");
      if (data.source === "server") setNote("운영 저장소에는 최근 200건만 남습니다. 더 오래된 기록은 자동으로 지워집니다.");
    })();
  }, []);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">5. 견적 기록</h2>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      {entries.length === 0 && <p className="text-sm text-slate-500">남긴 견적이 없습니다. 품목 조립에서 견적을 계산한 뒤 기록하면 여기에 남습니다.</p>}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="bg-white border border-slate-200 rounded-xl p-3 text-sm">
            <p>
              {formatSeoulMinute(entry.createdAt)} · {library.recipes.find((row) => row.productId === entry.productId)?.label ?? entry.productId}
            </p>
            <p>그때 제시한 공급가 {won(entry.presentedSupplyPrice)} · 부가세 {won(entry.presentedVat)} · 총액 {won(entry.presentedTotal)}</p>
            <p className="text-xs text-slate-500">
              그때 원가 {won(entry.internal?.supplyCost)} · 그때 추천가 {won(entry.internal?.recommendedSupplyPrice ?? entry.internal?.targetSupplyPrice)}
              {entry.staffName ? ` · 담당자 ${entry.staffName}` : ""}
              {entry.customerName ? ` · 거래처 ${entry.customerName}` : ""}
              {entry.input?.widthMm != null ? ` · ${entry.input.widthMm}×${entry.input.heightMm}mm ${entry.input.qty}개` : ""}
              {entry.adjustmentReason ? ` · ${entry.adjustmentReason}` : ""}
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

function kindSum(result: PricingResult, kind: "material" | "process"): string {
  const lines = result.lines.filter((line) => line.kind === kind);
  if (lines.length === 0) return won(0);
  if (lines.some((line) => line.status === "missing" || line.supplyCost == null)) return "원가 미등록";
  return won(lines.reduce((sum, line) => sum + (line.supplyCost ?? 0), 0));
}

function AddLine({
  label,
  options,
  onAdd,
}: {
  label: string;
  options: { id: string; label: string; favorite?: boolean }[];
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const recent = readRecent();
  const picked = pickSuggestions(options, query, recent);
  const groups = query.trim()
    ? [{ title: "검색 결과", rows: picked.matches }]
    : [
        { title: "즐겨찾기", rows: picked.favorites },
        { title: "최근 사용", rows: picked.recent },
      ];
  return (
    <div className="relative w-full sm:w-72">
      <input
        className={fieldClass}
        placeholder={`${label} 검색`}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow">
          {groups.every((group) => group.rows.length === 0) && (
            <p className="p-2 text-xs text-slate-500">{query.trim() ? "없는 이름입니다." : "즐겨찾기나 최근 항목이 없습니다. 이름을 입력하세요."}</p>
          )}
          {groups.map((group) => group.rows.length > 0 && (
            <div key={group.title}>
              <p className="px-2 pt-2 text-[11px] text-slate-400">{group.title}</p>
              {group.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="block w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => { onAdd(row.id); setQuery(""); setOpen(false); }}
                >
                  {row.favorite ? "★ " : ""}{row.label}
                </button>
              ))}
            </div>
          ))}
          <button type="button" className="block w-full text-left px-2 py-1.5 text-xs text-slate-500" onClick={() => setOpen(false)}>닫기</button>
        </div>
      )}
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
  { value: "krw-per-m", label: "원/m" },
  { value: "krw-per-m2", label: "원/㎡" },
  { value: "krw-per-sheet", label: "원/장" },
  { value: "krw-per-ea", label: "원/개" },
  { value: "krw-per-min", label: "원/분" },
  { value: "krw-per-order", label: "원/주문" },
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
  { value: "per-piece", label: "개당 고정 사용량" },
  { value: "per-meter-layout", label: "롤 배치로 길이 계산" },
  { value: "per-sheet-imposition", label: "시트 장수만큼" },
  { value: "per-m2", label: "면적만큼" },
];
