export interface QuoteCalcResult {
  missing: string[];
  warnings?: string[];
  supplyCost?: number;
  targetRate?: number;
  targetSupplyPrice?: number;
  productMinimumSupply?: number;
  recommendedSupplyPrice?: number;
  vatRate: number;
  lines?: unknown[];
  costLibraryRevision?: number;
  minimumApplied?: boolean;
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
  if (role === "admin") return body;
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
    },
  };
}

export function quoteEntryForRole<T extends { internal?: unknown }>(entry: T, role: "admin" | "staff"): T {
  if (role === "admin") return entry;
  const copy = { ...entry };
  delete copy.internal;
  return copy;
}
