export interface QuoteCalcResult {
  missing: string[];
  warnings?: string[];
  supplyCost?: number;
  targetRate?: number;
  targetSupplyPrice?: number;
  productMinimumSupply?: number;
  recommendedSupplyPrice?: number;
  vatRate: number;
  lines?: { kind?: string; name?: string; usageQty?: number; unitLabel?: string; layoutQty?: number; layoutUnit?: string }[];
  costLibraryRevision?: number;
  minimumApplied?: boolean;
  usage?: PaperUsage[];
}

export interface PaperUsage {
  name: string;
  qty: number;
  unit: "장" | "m";
  text: string;
}

export function paperUsage(lines: QuoteCalcResult["lines"]): PaperUsage[] {
  const rows: PaperUsage[] = [];
  for (const line of lines ?? []) {
    if (line.kind !== "material" || !line.name) continue;
    const unit = line.layoutUnit ?? line.unitLabel;
    const qty = line.layoutQty ?? line.usageQty;
    if ((unit !== "장" && unit !== "m") || qty == null || !Number.isFinite(qty)) continue;
    const shown = unit === "장" ? Math.round(qty * 10) / 10 : Math.round(qty * 100) / 100;
    rows.push({
      name: line.name,
      qty: shown,
      unit,
      text: unit === "장" ? `${line.name} ${shown}장` : `${line.name} ${shown}m 출력`,
    });
  }
  return rows;
}

export interface QuoteCalcBody {
  label: string;
  stage: string;
  stageLabel: string;
  issues: string[];
  fields: { width: boolean; height: boolean; gap: boolean };
  result: QuoteCalcResult;
}

/** 직원 응답에는 판매가 계산에 필요한 값만 남긴다. 원가와 이익률은 관리자만 받는다. */
export function quoteCalculationForRole(body: QuoteCalcBody, role: "admin" | "staff"): QuoteCalcBody {
  const usage = paperUsage(body.result.lines);
  if (role === "admin") return { ...body, result: { ...body.result, usage } };
  const recommended = body.result.recommendedSupplyPrice;
  const floor = body.result.productMinimumSupply;
  const target = body.result.targetSupplyPrice ?? 0;
  return {
    label: body.label,
    stage: body.stage,
    stageLabel: body.stageLabel,
    issues: [],
    fields: body.fields,
    result: {
      missing: body.result.missing,
      recommendedSupplyPrice: recommended,
      productMinimumSupply: floor,
      minimumApplied: floor != null && recommended === floor && target < floor,
      vatRate: body.result.vatRate,
      usage,
    },
  };
}

export function quoteEntryForRole<T extends { internal?: unknown }>(entry: T, role: "admin" | "staff"): T {
  if (role === "admin") return entry;
  const copy = { ...entry };
  delete copy.internal;
  return copy;
}
