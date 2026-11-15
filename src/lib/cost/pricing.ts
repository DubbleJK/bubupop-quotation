import { calcVatAndTotal, roundToNearest10 } from "@/lib/calc/common";
import type { AppConfig } from "@/lib/config/types";
import type {
  ChargeMethod,
  CostAmount,
  CostLibrary,
  CostStatus,
  MarginPolicy,
  MaterialCost,
  ProcessDef,
  ProductRecipe,
  RecipeUsage,
  SimulationInput,
} from "./types";
import { currentLegacySale, type LegacySale } from "./legacySale";

export interface CostLine {
  lineId: string;
  name: string;
  kind: "material" | "process";
  usageQty?: number;
  unitLabel?: string;
  grossAmount?: number;
  supplyCost?: number;
  variableCost?: number;
  fixedCost?: number;
  status: CostStatus | "missing";
  reason?: string;
}

export interface PriceBand {
  supplyPrice?: number;
  profit?: number;
  marginRate?: number;
  vat?: number;
  total?: number;
  reason?: string;
}

export interface PricingResult {
  productId: string;
  lines: CostLine[];
  missing: string[];
  references: string[];
  supplyCost?: number;
  variableCost?: number;
  fixedCost?: number;
  minimum?: PriceBand;
  target?: PriceBand;
  high?: PriceBand;
  minimumSalePrice?: number;
  referenceSimulation: boolean;
  approvalAllowed: boolean;
  current?: LegacySale;
  deltaSupply?: number;
  deltaRate?: number;
  contribution?: number;
  contributionMargin?: number;
  /** 고정비가 없으면 공헌이익률과 같고, 있으면 총제작원가 기준 이익률이다. */
  profitBasis?: "contribution" | "total-cost";
  currentProfit?: number;
  currentMarginRate?: number;
  belowTarget: boolean;
  belowMinimum: boolean;
  costLibraryRevision: number;
  marginEffectiveFrom?: string;
  vatRateUsed: number;
  /** 변동원가 기준 추천가와 별도로, 수량이 생산 한도를 넘으면 안내만 한다. */
  capacityWarning?: string;
  usesVirtualCost: boolean;
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function exclusiveAmount(price: CostAmount | undefined, vatRate: number, asOf: string): number | "missing" | "later" {
  if (!price || price.status === "unconfirmed" || !finite(price.amount)) return "missing";
  if (!price.effectiveFrom || price.effectiveFrom > asOf) return "later";
  if (price.tax === "inclusive") {
    if (!finite(vatRate) || vatRate < 0) return "missing";
    return price.amount / (1 + vatRate);
  }
  return price.amount;
}

function lineStatus(used: CostStatus[]): CostStatus {
  return used.includes("code-reference") ? "code-reference" : "confirmed";
}

function measure(
  usage: RecipeUsage,
  input: SimulationInput,
  trimMarginMm: number
): { value: number; unitLabel: string } | { missing: string } {
  const qty = input.qty;
  if (!finite(qty) || qty < 1) return { missing: "수량이 없습니다." };
  if (usage === "per-order") return { value: 1, unitLabel: "주문" };
  if (usage === "per-piece") return { value: qty, unitLabel: "개" };
  const width = input.widthMm;
  const height = input.heightMm;
  if (usage === "per-m2") {
    if (!finite(width) || !finite(height) || width <= 0 || height <= 0) {
      return { missing: "면적을 계산할 가로·세로가 없습니다." };
    }
    return { value: (width / 1000) * (height / 1000) * qty, unitLabel: "㎡" };
  }
  if (usage === "per-meter-layout") {
    if (!finite(height) || height <= 0) return { missing: "배치 길이를 계산할 세로가 없습니다." };
    const gap = finite(input.gapMm) ? input.gapMm : 0;
    return { value: (qty * height + Math.max(0, qty - 1) * gap) / 1000, unitLabel: "m" };
  }
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) {
    return { missing: "시트 매수를 계산할 가로·세로가 없습니다." };
  }
  const sheetW = 210 - trimMarginMm * 2;
  const sheetH = 297 - trimMarginMm * 2;
  const gap = finite(input.gapMm) ? input.gapMm : 0;
  const perA = Math.floor(sheetW / (width + gap)) * Math.floor(sheetH / (height + gap));
  const perB = Math.floor(sheetW / (height + gap)) * Math.floor(sheetH / (width + gap));
  const perSheet = Math.max(perA, perB);
  if (perSheet < 1) return { missing: "이 크기는 A4 시트에 배치할 수 없습니다." };
  return { value: Math.ceil(qty / perSheet), unitLabel: "장" };
}

function matchingBand(bands: { minQty: number; maxQty?: number; unitPrice: number }[] | undefined, qty: number): number | undefined {
  if (!bands?.length || !finite(qty)) return undefined;
  const found = bands.find((band) => qty >= band.minQty && (band.maxQty == null || qty <= band.maxQty) && finite(band.unitPrice));
  return found?.unitPrice;
}

function materialCost(
  material: MaterialCost,
  needed: number,
  vatRate: number,
  asOf: string
): { supply?: number; gross?: number; status?: CostStatus; reason?: string } {
  const tier = matchingBand(material.purchaseTiers, needed);
  let unitPrice: number;
  let status: CostStatus = "confirmed";
  let gross = material.price.amount;
  if (tier != null) {
    unitPrice = tier;
    gross = tier;
  } else {
    const exclusive = exclusiveAmount(material.price, vatRate, asOf);
    if (exclusive === "missing") return { reason: "매입가가 미등록입니다." };
    if (exclusive === "later") return { reason: "매입가 적용일 전입니다." };
    const sameUnit = material.purchaseUnit === material.usageUnit;
    unitPrice = exclusive;
    if (!sameUnit) {
      if (material.conversionStatus !== "confirmed" || !finite(material.conversion) || material.conversion <= 0) {
        return { reason: "단위 환산이 미등록입니다." };
      }
      unitPrice = exclusive / material.conversion;
    }
    status = material.price.status === "code-reference" ? "code-reference" : "confirmed";
  }
  if (material.wasteStatus !== "confirmed" || !finite(material.wasteRate) || material.wasteRate < 0 || material.wasteRate >= 1) {
    return { reason: "로스율이 미등록입니다." };
  }
  const consumed = needed / (1 - material.wasteRate);
  const supply = Math.round(consumed * unitPrice);
  if (!Number.isFinite(supply)) return { reason: "계산할 수 없는 금액입니다." };
  return { supply, gross, status };
}

function moneyOf(result: ReturnType<typeof exclusiveAmount>, status: CostStatus | undefined): { amount?: number; status?: CostStatus; reason?: string } {
  if (result === "missing") return { reason: "금액이 미등록입니다." };
  if (result === "later") return { reason: "적용일 전입니다." };
  return { amount: result, status };
}

function applyMinCharge(
  result: { supply?: number; variable?: number; fixed?: number; status?: CostStatus; reason?: string },
  minCharge: number | undefined
): { supply?: number; variable?: number; fixed?: number; status?: CostStatus; reason?: string } {
  if (result.reason || result.supply == null || !finite(minCharge) || result.supply >= minCharge) return result;
  const gap = Math.round(minCharge - result.supply);
  return {
    ...result,
    supply: Math.round(minCharge),
    fixed: Math.round((result.fixed ?? 0) + gap),
  };
}

function processCost(
  process: ProcessDef,
  usageQty: number,
  orderQty: number,
  vatRate: number,
  asOf: string
): { supply?: number; variable?: number; fixed?: number; status?: CostStatus; reason?: string } {
  const method: ChargeMethod = process.method;
  const take = (price: CostAmount | undefined) => moneyOf(exclusiveAmount(price, vatRate, asOf), price?.status);

  if (method === "per-order") {
    const setup = take(process.setup);
    if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
    return applyMinCharge(
      { supply: Math.round(setup.amount), fixed: Math.round(setup.amount), variable: 0, status: setup.status },
      process.minCharge
    );
  }

  if (method === "per-minute") {
    const labor = take(process.laborPerMin);
    const equipment = take(process.equipmentPerMin);
    if (labor.reason || equipment.reason || labor.amount == null || equipment.amount == null) {
      return { reason: labor.reason ?? equipment.reason ?? "분당 인건비 또는 장비비가 미등록입니다." };
    }
    const minutes = process.minutes;
    if (!minutes || minutes.status === "unconfirmed" || !finite(minutes.value)) {
      return { reason: "작업시간이 미등록입니다." };
    }
    const totalMinutes = minutes.value * (minutes.per === "order" ? 1 : usageQty);
    let fixed = 0;
    const used: CostStatus[] = [labor.status ?? "confirmed", equipment.status ?? "confirmed", minutes.status];
    if (process.setup) {
      const setup = take(process.setup);
      if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
      fixed = setup.amount;
      used.push(setup.status);
    }
    const variable = (labor.amount + equipment.amount) * totalMinutes;
    return applyMinCharge(
      {
        supply: Math.round(variable + fixed),
        variable: Math.round(variable),
        fixed: Math.round(fixed),
        status: lineStatus(used),
      },
      process.minCharge
    );
  }

  const band = matchingBand(process.quantityBands, orderQty);
  const variablePrice = band != null ? { amount: band, status: "confirmed" as const } : take(process.variable);
  if (variablePrice.reason || variablePrice.amount == null || variablePrice.status == null) {
    return { reason: variablePrice.reason ?? "공정 단가가 미등록입니다." };
  }
  if (method === "setup-plus-qty") {
    const setup = take(process.setup);
    if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
    const variable = variablePrice.amount * usageQty;
    return applyMinCharge(
      {
        supply: Math.round(setup.amount + variable),
        variable: Math.round(variable),
        fixed: Math.round(setup.amount),
        status: lineStatus([variablePrice.status, setup.status]),
      },
      process.minCharge
    );
  }

  const variable = variablePrice.amount * usageQty;
  return applyMinCharge(
    {
      supply: Math.round(variable),
      variable: Math.round(variable),
      fixed: 0,
      status: variablePrice.status,
    },
    process.minCharge
  );
}

export const DEFAULT_MINIMUM_RATE = 0.2;
export const DEFAULT_TARGET_RATE = 0.35;

export function recommendSupply(supplyCost: number, rate: number | undefined, vatRate: number): PriceBand {
  if (!finite(rate)) return {};
  if (rate < 0 || rate >= 1) return { reason: "이익률은 100% 미만이어야 한다" };
  const supplyPrice = roundToNearest10(supplyCost / (1 - rate));
  const profit = supplyPrice - supplyCost;
  const vatAndTotal = calcVatAndTotal(supplyPrice, vatRate);
  return {
    supplyPrice,
    profit,
    marginRate: supplyPrice === 0 ? undefined : profit / supplyPrice,
    vat: vatAndTotal.vat,
    total: vatAndTotal.total,
  };
}

function pushNamed(list: string[], name: string, reason: string) {
  list.push(`${name}: ${reason}`);
}

export function simulatePricing(
  library: CostLibrary,
  config: AppConfig,
  input: SimulationInput,
  asOf: string
): PricingResult {
  const recipe = library.recipes.find((row) => row.productId === input.productId);
  const vatRate = config.settings.vatRate;
  const base: PricingResult = {
    productId: input.productId,
    lines: [],
    missing: [],
    references: [],
    referenceSimulation: false,
    approvalAllowed: false,
    belowTarget: false,
    belowMinimum: false,
    costLibraryRevision: library.revision,
    vatRateUsed: vatRate,
    usesVirtualCost: false,
  };
  if (!finite(input.qty) || input.qty < 1) {
    base.missing.push("수량은 1 이상이어야 합니다.");
    return base;
  }
  if ((finite(input.widthMm) && input.widthMm <= 0) || (finite(input.heightMm) && input.heightMm <= 0)) {
    base.missing.push("가로·세로는 0보다 커야 합니다.");
    return base;
  }
  if (!recipe) {
    base.missing.push("레시피 없음");
    return base;
  }

  for (const line of recipe.lines) {
    const measuredRaw = measure(line.usage, input, config.settings.trimMarginMm);
    const times = finite(line.times) && line.times > 0 ? line.times : 1;
    const measured = "missing" in measuredRaw ? measuredRaw : { ...measuredRaw, value: measuredRaw.value * times };
    if ("missing" in measured) {
      base.lines.push({ lineId: line.lineId, name: line.refId, kind: line.kind, status: "missing", reason: measured.missing });
      pushNamed(base.missing, line.refId, measured.missing);
      continue;
    }
    if (line.kind === "material") {
      const material = library.materials.find((row) => row.id === line.refId);
      if (!material) {
        base.lines.push({ lineId: line.lineId, name: line.refId, kind: "material", status: "missing", reason: "원자재가 없습니다." });
        pushNamed(base.missing, line.refId, "원자재가 없습니다.");
        continue;
      }
      const cost = materialCost(material, measured.value, vatRate, asOf);
      const once = line.usage === "per-order";
      if (material.price.note?.includes("가상") || material.price.status === "code-reference") base.usesVirtualCost = true;
      base.lines.push({
        lineId: line.lineId,
        name: material.label,
        kind: "material",
        usageQty: measured.value,
        unitLabel: measured.unitLabel,
        grossAmount: cost.gross,
        supplyCost: cost.supply,
        variableCost: once ? 0 : cost.supply,
        fixedCost: once ? cost.supply : 0,
        status: cost.reason ? "missing" : cost.status ?? "missing",
        reason: cost.reason,
      });
      if (cost.reason) pushNamed(base.missing, material.label, cost.reason);
      else if (cost.status === "code-reference") base.references.push(material.label);
      continue;
    }

    const process = library.processes.find((row) => row.id === line.refId);
    if (!process) {
      base.lines.push({ lineId: line.lineId, name: line.refId, kind: "process", status: "missing", reason: "공정이 없습니다." });
      pushNamed(base.missing, line.refId, "공정이 없습니다.");
      continue;
    }
    const cost = processCost(process, measured.value, input.qty, vatRate, asOf);
    base.lines.push({
      lineId: line.lineId,
      name: process.label,
      kind: "process",
      usageQty: measured.value,
      unitLabel: measured.unitLabel,
      supplyCost: cost.supply,
      variableCost: cost.variable,
      fixedCost: cost.fixed,
      status: cost.reason ? "missing" : cost.status ?? "missing",
      reason: cost.reason,
    });
    if (cost.reason) pushNamed(base.missing, process.label, cost.reason);
    else if (cost.status === "code-reference") base.references.push(process.label);
  }

  if (recipe.lines.length > 0 && base.missing.length === 0) {
    const supplyCost = base.lines.reduce((sum, line) => sum + (line.supplyCost ?? 0), 0);
    const variableCost = base.lines.reduce((sum, line) => sum + (line.variableCost ?? 0), 0);
    const fixedCost = base.lines.reduce((sum, line) => sum + (line.fixedCost ?? 0), 0);
    base.supplyCost = supplyCost;
    base.variableCost = variableCost;
    base.fixedCost = fixedCost;
    const margin = library.margins.find((row) => row.productId === recipe.productId);
    const scheduledLater = margin != null && margin.effectiveFrom > asOf;
    if (!scheduledLater) {
      const minimumRate = margin?.minimumRate ?? DEFAULT_MINIMUM_RATE;
      const targetRate = margin?.targetRate ?? DEFAULT_TARGET_RATE;
      base.marginEffectiveFrom = margin?.effectiveFrom;
      base.profitBasis = fixedCost > 0 ? "total-cost" : "contribution";
      base.minimum = recommendSupply(supplyCost, minimumRate, vatRate);
      base.target = recommendSupply(supplyCost, targetRate, vatRate);
    }
    const limits = [recipe.reviewAboveQty, ...recipe.lines.map((line) => library.processes.find((row) => row.id === line.refId)?.reviewAboveQty)];
    const limit = limits.filter((value): value is number => finite(value) && value > 0).sort((a, b) => a - b)[0];
    if (limit != null && input.qty > limit) base.capacityWarning = "관리자 확인 필요";
    const floor = recipe.legacyQuoteId === "sticker-sheet" ? config.settings.minStickerSupply : undefined;
    const fromMargin = base.minimum?.supplyPrice;
    if (finite(fromMargin) || finite(floor)) {
      base.minimumSalePrice = Math.max(fromMargin ?? 0, floor ?? 0);
    }
    base.referenceSimulation = base.references.length > 0;
    base.approvalAllowed = !base.referenceSimulation && finite(base.target?.supplyPrice);
  }

  const current = currentLegacySale(config, recipe, input);
  if (current) {
    base.current = current;
    if (finite(current.supplyPrice) && finite(base.target?.supplyPrice)) {
      base.deltaSupply = base.target.supplyPrice - current.supplyPrice;
      base.deltaRate = current.supplyPrice === 0 ? undefined : base.deltaSupply / current.supplyPrice;
      base.belowTarget = current.supplyPrice < base.target.supplyPrice;
    }
    if (finite(current.supplyPrice) && finite(base.supplyCost)) {
      base.currentProfit = current.supplyPrice - base.supplyCost;
      base.currentMarginRate = current.supplyPrice === 0 ? undefined : base.currentProfit / current.supplyPrice;
      const minimumRate = library.margins.find((row) => row.productId === recipe.productId)?.minimumRate ?? DEFAULT_MINIMUM_RATE;
      base.belowMinimum = finite(base.currentMarginRate) && base.currentMarginRate < minimumRate;
    }
    if (finite(current.supplyPrice) && finite(base.variableCost)) {
      base.contribution = current.supplyPrice - base.variableCost;
      base.contributionMargin = current.supplyPrice === 0 ? undefined : base.contribution / current.supplyPrice;
    }
  }
  return base;
}

export function approveRecordedPrice(
  library: CostLibrary,
  body: { confirm?: boolean; productId?: string; supplyPrice?: number }
): { ok: true; library: CostLibrary } | { ok: false; error: string } {
  if (body.confirm !== true) return { ok: false, error: "confirm_required" };
  if (!body.productId || !finite(body.supplyPrice)) return { ok: false, error: "invalid_body" };
  const recipe = library.recipes.find((row) => row.productId === body.productId);
  if (!recipe) return { ok: false, error: "missing_product" };
  const next: ProductRecipe = { ...recipe, approvedSupplyPrice: body.supplyPrice };
  return {
    ok: true,
    library: {
      ...library,
      recipes: library.recipes.map((row) => (row.productId === recipe.productId ? next : row)),
    },
  };
}

export function marginOf(library: CostLibrary, productId: string): MarginPolicy | undefined {
  return library.margins.find((row) => row.productId === productId);
}

export interface QtyCompareRow {
  qty: number;
  supplyCost?: number;
  recommendedSupply?: number;
  unitSupply?: number;
  marginRate?: number;
  status: "ok" | "missing" | "inversion" | "review" | "low-margin";
  note?: string;
}

/** 같은 품목·규격에서 수량만 바꿔 비교한다. 역전이 있어도 판매가는 바꾸지 않는다. */
export function compareQuantities(
  library: CostLibrary,
  config: AppConfig,
  input: SimulationInput,
  qtys: number[],
  asOf: string
): QtyCompareRow[] {
  const ordered = [...qtys].filter((qty) => finite(qty) && qty >= 1).sort((a, b) => a - b);
  const rows: QtyCompareRow[] = ordered.map((qty) => {
    const result = simulatePricing(library, config, { ...input, qty }, asOf);
    const recommended = result.target?.supplyPrice;
    const status: QtyCompareRow["status"] = result.missing.length > 0 ? "missing" : result.capacityWarning ? "review" : result.belowMinimum ? "low-margin" : "ok";
    return {
      qty,
      supplyCost: result.supplyCost,
      recommendedSupply: recommended,
      unitSupply: finite(recommended) ? Math.round(recommended / qty) : undefined,
      marginRate: result.target?.marginRate,
      status,
      note: result.missing[0] ?? result.capacityWarning ?? (result.belowMinimum ? "현재 판매가의 이익률이 최소 확보 이익률보다 낮습니다. 고객 판매가는 바꾸지 않았습니다." : undefined),
    };
  });
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]?.recommendedSupply;
    const current = rows[index]?.recommendedSupply;
    if (finite(previous) && finite(current) && current < previous) {
      rows[index] = {
        ...rows[index],
        status: "inversion",
        note: "수량이 늘었는데 추천 총액이 줄어듭니다. 고객 판매가는 바꾸지 않았습니다.",
      };
    }
  }
  return rows;
}
