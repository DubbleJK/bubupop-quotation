import type {
  CostAmount,
  CostChange,
  CostLibrary,
  EquipmentCost,
  MarginPolicy,
  MaterialCost,
  ProcessDef,
  ProductRecipe,
} from "./types";

export const COST_LIBRARY_KEY = "quotation_cost_library";
export const QUOTE_LOG_KEY = "quotation_quote_log";

const LEGACY: Array<[ProductRecipe["productId"], string, NonNullable<ProductRecipe["legacyQuoteId"]>]> = [
  ["pop", "POP", "pop"],
  ["sticker-sheet", "스티커 시트", "sticker-sheet"],
  ["sticker-solvent", "스티커 솔벤트", "sticker-solvent"],
  ["uv-acrylic-keyring", "UV아크릴키링", "uv-acrylic-keyring"],
  ["dtf", "DTF", "dtf"],
  ["tshirt", "티셔츠", "tshirt"],
  ["business-card", "명함", "business-card"],
  ["banner", "배너", "banner"],
];

function dtfEquipmentSeed(): EquipmentCost {
  return {
    id: "dtf-equipment",
    label: "DTF 장비",
    rollWidthMm: 850,
    history: [],
    price: {
      amount: 1350,
      unit: "krw-per-m",
      tax: "exclusive",
      status: "code-reference",
      effectiveFrom: "2026-01-01",
      note: "코드의 dtfCostPerM 참고값. 판매단가 13900과 별개이며 확정 매입이 아니다.",
    },
  };
}

export function emptyCostLibrary(): CostLibrary {
  return {
    revision: 0,
    updatedAt: null,
    materials: [],
    processes: [],
    equipment: [dtfEquipmentSeed()],
    recipes: LEGACY.map(([productId, label, legacyQuoteId]) => ({
      productId,
      label,
      active: true,
      legacyQuoteId,
      lines: [],
      showOnCustomerQuote: false,
    })),
    margins: [],
  };
}

export function newCostId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function blankAmount(unit: CostAmount["unit"], today: string): CostAmount {
  return { unit, tax: "exclusive", status: "unconfirmed", effectiveFrom: today };
}

export function seoulToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function referencedIds(library: CostLibrary, kind: "material" | "process"): Set<string> {
  const ids = new Set<string>();
  for (const recipe of library.recipes) {
    for (const line of recipe.lines) {
      if (line.kind === kind) ids.add(line.refId);
    }
  }
  return ids;
}

export function removeMaterial(
  library: CostLibrary,
  id: string
): { ok: true; library: CostLibrary } | { ok: false; error: string } {
  if (referencedIds(library, "material").has(id)) {
    return { ok: false, error: "품목에 연결된 원자재는 삭제할 수 없습니다. 비활성화하세요." };
  }
  return { ok: true, library: { ...library, materials: library.materials.filter((row) => row.id !== id) } };
}

export function removeProcess(
  library: CostLibrary,
  id: string
): { ok: true; library: CostLibrary } | { ok: false; error: string } {
  if (referencedIds(library, "process").has(id)) {
    return { ok: false, error: "품목에 연결된 공정은 삭제할 수 없습니다. 비활성화하세요." };
  }
  return { ok: true, library: { ...library, processes: library.processes.filter((row) => row.id !== id) } };
}

function amountChanged(before: CostAmount | undefined, after: CostAmount | undefined): boolean {
  return (
    before?.amount !== after?.amount ||
    before?.status !== after?.status ||
    before?.tax !== after?.tax ||
    before?.unit !== after?.unit ||
    before?.effectiveFrom !== after?.effectiveFrom
  );
}

function pushChange(
  history: CostChange[],
  revision: number,
  at: string,
  field: string,
  before?: number | string,
  after?: number | string
): CostChange[] {
  if (before === after) return history;
  return [...history, { revision, at, field, before, after }];
}

function sameRecipe(a: ProductRecipe, b: ProductRecipe): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 저장 시 개정 번호와 변경 이력만 더한다. 판매 설정은 받지 않는다. */
export function withLibraryRevision(previous: CostLibrary | null, incoming: CostLibrary, now = new Date()): CostLibrary {
  const revision = (previous?.revision ?? 0) + 1;
  const at = now.toISOString();
  const prevMaterials = new Map((previous?.materials ?? []).map((row) => [row.id, row]));
  const prevProcesses = new Map((previous?.processes ?? []).map((row) => [row.id, row]));
  const prevMargins = new Map((previous?.margins ?? []).map((row) => [row.productId, row]));

  const materials = incoming.materials.map((row) => {
    const prev = prevMaterials.get(row.id);
    let history = row.history ?? [];
    if (!prev) return { ...row, history };
    history = pushChange(history, revision, at, "price.amount", prev.price.amount, row.price.amount);
    history = pushChange(history, revision, at, "wasteRate", prev.wasteRate, row.wasteRate);
    history = pushChange(history, revision, at, "conversion", prev.conversion, row.conversion);
    history = pushChange(history, revision, at, "active", String(prev.active), String(row.active));
    if (amountChanged(prev.price, row.price) && prev.price.amount === row.price.amount) {
      history = pushChange(history, revision, at, "price.status", prev.price.status, row.price.status);
    }
    return { ...row, history };
  });

  const processes = incoming.processes.map((row) => {
    const prev = prevProcesses.get(row.id);
    let history = row.history ?? [];
    if (!prev) return { ...row, history };
    history = pushChange(history, revision, at, "variable.amount", prev.variable?.amount, row.variable?.amount);
    history = pushChange(history, revision, at, "setup.amount", prev.setup?.amount, row.setup?.amount);
    history = pushChange(history, revision, at, "active", String(prev.active), String(row.active));
    return { ...row, history };
  });

  const margins = incoming.margins.map((row) => {
    const prev = prevMargins.get(row.productId);
    const history = prev
      ? pushChange(row.history ?? [], revision, at, "targetRate", prev.targetRate, row.targetRate)
      : row.history ?? [];
    return { ...row, revision: prev ? prev.revision + 1 : 1, history };
  });

  return {
    ...incoming,
    revision,
    updatedAt: at,
    materials,
    processes,
    margins,
    equipment: incoming.equipment ?? previous?.equipment ?? [],
    recipes: incoming.recipes.map((row) => {
      const prev = previous?.recipes.find((item) => item.productId === row.productId);
      return prev && sameRecipe(prev, row) ? prev : row;
    }),
  };
}

export function assertLibraryKeepsUsedRows(
  previous: CostLibrary | null,
  incoming: CostLibrary
): string | null {
  if (!previous) return null;
  const materialIds = new Set(incoming.materials.map((row) => row.id));
  const processIds = new Set(incoming.processes.map((row) => row.id));
  for (const recipe of incoming.recipes) {
    for (const line of recipe.lines) {
      if (line.kind === "material" && !materialIds.has(line.refId)) {
        return "사용 중인 원자재를 라이브러리에서 뺄 수 없습니다.";
      }
      if (line.kind === "process" && !processIds.has(line.refId)) {
        return "사용 중인 공정을 라이브러리에서 뺄 수 없습니다.";
      }
    }
  }
  return null;
}

export function upsertMargin(library: CostLibrary, productId: string, today: string): MarginPolicy {
  const found = library.margins.find((row) => row.productId === productId);
  if (found) return found;
  return { productId, effectiveFrom: today, revision: 0, history: [] };
}
