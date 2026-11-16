import { calcVatAndTotal, ceilToNearest10 } from "@/lib/calc/common";
import { placeOnRoll } from "@/lib/calc/dtf";
import { placeOnSheet } from "@/lib/calc/sheet";
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
import { usageUnitPrice } from "./rollPrice";

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
  /** 가로·세로를 썼는지, 개당 고정인지를 관리자에게 보여 준다. */
  usageNote?: string;
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
  /** 목표 이익률 추천가와 품목 최소 공급가 중 큰 금액. 원가에 더하지 않는다. */
  recommendedSupplyPrice?: number;
  /** 품목에 적은 부가세 별도 최소 공급가. 10원 단위로 올린 값. */
  productMinimumSupply?: number;
  referenceSimulation: boolean;
  approvalAllowed: boolean;
  /** 작업비 없이 재료비만 있으면 추천가를 그대로 믿지 않는다. */
  laborUnpriced?: boolean;
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
  /** 계산은 막지 않고, 이름 중복이나 비용 중복 가능성만 알린다. */
  warnings: string[];
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

function measure(args: {
  usage: RecipeUsage;
  input: SimulationInput;
  trimMarginMm: number;
  rollWidthMm?: number;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
  allowRotate: boolean;
  manualPerSheet?: number;
}): { value: number; unitLabel: string; note?: string; perSheet?: number } | { missing: string } {
  const { usage, input } = args;
  const qty = input.qty;
  if (!finite(qty) || qty < 1) return { missing: "수량이 없습니다." };
  if (usage === "per-order") return { value: 1, unitLabel: "주문", note: "주문마다 한 번만 계산합니다." };
  if (usage === "per-piece") {
    return { value: qty, unitLabel: "개", note: "개당 고정 사용량입니다. 가로·세로는 이 줄에 반영되지 않습니다." };
  }
  const width = input.widthMm;
  const height = input.heightMm;
  if (usage === "per-m2") {
    if (!finite(width) || !finite(height) || width <= 0 || height <= 0) {
      return { missing: "면적을 계산할 가로·세로가 없습니다." };
    }
    return { value: (width / 1000) * (height / 1000) * qty, unitLabel: "㎡", note: "가로·세로로 면적을 계산합니다." };
  }
  if (usage === "per-meter-layout") {
    if (!finite(args.rollWidthMm) || args.rollWidthMm <= 0) {
      return { missing: "롤 폭이 없어 배치 길이를 계산하지 않습니다. 롤 폭을 입력하거나 개당 고정 길이로 바꾸세요." };
    }
    if (!finite(width) || width <= 0 || !finite(height) || height <= 0) {
      return { missing: "배치하려면 가로와 세로가 필요합니다." };
    }
    if (!finite(input.gapMm) || input.gapMm < 0) {
      return { missing: "배치 간격이 없어 필름 길이를 계산하지 않습니다." };
    }
    const placed = placeOnRoll({ rollWidthMm: args.rollWidthMm, gapMm: input.gapMm, widthMm: width, heightMm: height, qty });
    if (!placed.ok) return { missing: placed.error ?? "롤에 배치할 수 없습니다." };
    const turned = placed.rotated ? ", 돌려 배치" : "";
    return {
      value: placed.lengthM,
      unitLabel: "m",
      note: `롤 폭 ${args.rollWidthMm}mm에 ${placed.itemsPerRow}개씩 ${placed.rows}줄${turned}. 로스는 이 길이에 한 번만 적용합니다.`,
    };
  }
  if (finite(args.manualPerSheet) && args.manualPerSheet >= 1) {
    const sheets = Math.ceil(qty / args.manualPerSheet);
    return {
      value: sheets,
      unitLabel: "장",
      perSheet: args.manualPerSheet,
      note: `수동 배치로 한 장에 ${args.manualPerSheet}개, ${sheets}장입니다. 자동 네스팅 결과가 아닙니다.`,
    };
  }
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) {
    return { missing: "시트 매수를 계산할 가로·세로가 없습니다." };
  }
  const hasSheet = finite(args.sheetWidthMm) && finite(args.sheetHeightMm) && args.sheetWidthMm > 0 && args.sheetHeightMm > 0;
  const sheetWidthMm = hasSheet ? args.sheetWidthMm! : 210;
  const sheetHeightMm = hasSheet ? args.sheetHeightMm! : 297;
  const placed = placeOnSheet({
    sheetWidthMm,
    sheetHeightMm,
    trimMm: args.trimMarginMm,
    gapMm: finite(input.gapMm) ? input.gapMm : 0,
    itemWidthMm: width,
    itemHeightMm: height,
    qty,
    allowRotate: args.allowRotate,
  });
  if (!placed.ok) return { missing: placed.error ?? "판재에 배치할 수 없습니다." };
  const turned = placed.rotated ? ", 돌려 배치" : "";
  const sourceNote = hasSheet
    ? `판재 ${sheetWidthMm}×${sheetHeightMm}mm, 사방 여백 ${args.trimMarginMm}mm, 사용 영역 ${placed.usableWidthMm}×${placed.usableHeightMm}mm`
    : `판재 규격이 없어 A4 210×297mm로 계산했습니다. 사방 여백 ${args.trimMarginMm}mm, 사용 영역 ${placed.usableWidthMm}×${placed.usableHeightMm}mm`;
  return {
    value: placed.sheets,
    unitLabel: "장",
    perSheet: placed.perSheet,
    note: `${sourceNote}. 한 장에 ${placed.perSheet}개, ${placed.sheets}장${turned}. 간격은 스티커 사이에만 둡니다. 격자 배치이며 네스팅이 아닙니다.`,
  };
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
    const priced = usageUnitPrice(material, vatRate, asOf);
    if (priced.reason || priced.amount == null) return { reason: priced.reason ?? "매입가가 미등록입니다." };
    unitPrice = priced.amount;
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
  asOf: string,
  options?: { chargeSetup?: boolean; setupPrice?: CostAmount }
): { supply?: number; variable?: number; fixed?: number; status?: CostStatus; reason?: string; floorApplied?: boolean; setupSkipped?: boolean } {
  const method: ChargeMethod = process.method;
  const chargeSetup = options?.chargeSetup !== false;
  const setupPrice = chargeSetup ? options?.setupPrice ?? process.setup : undefined;
  const take = (price: CostAmount | undefined) => moneyOf(exclusiveAmount(price, vatRate, asOf), price?.status);
  const finish = (
    result: { supply?: number; variable?: number; fixed?: number; status?: CostStatus; reason?: string }
  ) => {
    const floored = applyMinCharge(result, process.minCharge);
    const floorApplied = floored.supply != null && result.supply != null && floored.supply > result.supply;
    return { ...floored, floorApplied, setupSkipped: !chargeSetup };
  };

  if (!chargeSetup && method === "per-order") {
    return { supply: 0, variable: 0, fixed: 0, status: "confirmed", setupSkipped: true };
  }

  if (method === "per-order") {
    const setup = take(setupPrice);
    if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
    return finish({ supply: Math.round(setup.amount), fixed: Math.round(setup.amount), variable: 0, status: setup.status });
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
    if (setupPrice) {
      const setup = take(setupPrice);
      if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
      fixed = setup.amount;
      used.push(setup.status);
    }
    const variable = (labor.amount + equipment.amount) * totalMinutes;
    return finish({
      supply: Math.round(variable + fixed),
      variable: Math.round(variable),
      fixed: Math.round(fixed),
      status: lineStatus(used),
    });
  }

  const band = matchingBand(process.quantityBands, orderQty);
  const variablePrice = band != null ? { amount: band, status: "confirmed" as const } : take(process.variable);
  if (variablePrice.reason || variablePrice.amount == null || variablePrice.status == null) {
    return { reason: variablePrice.reason ?? "공정 단가가 미등록입니다." };
  }
  const variable = variablePrice.amount * usageQty;
  if (method === "setup-plus-qty") {
    if (!setupPrice) {
      if (!chargeSetup) {
        return finish({ supply: Math.round(variable), variable: Math.round(variable), fixed: 0, status: variablePrice.status });
      }
      return { reason: "세팅비가 미등록입니다." };
    }
    const setup = take(setupPrice);
    if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
    return finish({
      supply: Math.round(setup.amount + variable),
      variable: Math.round(variable),
      fixed: Math.round(setup.amount),
      status: lineStatus([variablePrice.status, setup.status]),
    });
  }

  let fixed = 0;
  const used: CostStatus[] = [variablePrice.status];
  if (setupPrice) {
    const setup = take(setupPrice);
    if (setup.reason || setup.amount == null || setup.status == null) return { reason: setup.reason ?? "세팅비가 미등록입니다." };
    fixed = setup.amount;
    used.push(setup.status);
  }
  return finish({
    supply: Math.round(variable + fixed),
    variable: Math.round(variable),
    fixed: Math.round(fixed),
    status: lineStatus(used),
  });
}

export const DEFAULT_MINIMUM_RATE = 0.2;
export const DEFAULT_TARGET_RATE = 0.35;

export function recommendSupply(supplyCost: number, rate: number | undefined, vatRate: number): PriceBand {
  if (!finite(rate)) return {};
  if (rate < 0 || rate >= 1) return { reason: "이익률은 100% 미만이어야 한다" };
  const supplyPrice = ceilToNearest10(supplyCost / (1 - rate));
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
    warnings: [],
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

  const selectedOptions = new Set(input.optionIds ?? []);
  const setupCharged = new Set<string>();
  for (const line of recipe.lines) {
    if (line.optionId && !selectedOptions.has(line.optionId)) continue;
    const materialForMeasure = line.kind === "material" ? library.materials.find((row) => row.id === line.refId) : undefined;
    const processForMeasure = line.kind === "process" ? library.processes.find((row) => row.id === line.refId) : undefined;
    const lineName = materialForMeasure?.label ?? processForMeasure?.label ?? line.refId;
    const sharedRoll = recipe.lines
      .filter((item) => item.kind === "material")
      .map((item) => library.materials.find((row) => row.id === item.refId)?.rollWidthMm)
      .find((width) => finite(width) && width > 0);
    const sharedSheet = recipe.lines
      .filter((item) => item.kind === "material")
      .map((item) => library.materials.find((row) => row.id === item.refId))
      .find((row) => finite(row?.sheetWidthMm) && finite(row?.sheetHeightMm));
    const measuredRaw = measure({
      usage: line.usage,
      input,
      trimMarginMm: config.settings.trimMarginMm,
      rollWidthMm: materialForMeasure?.rollWidthMm ?? sharedRoll,
      sheetWidthMm: materialForMeasure?.sheetWidthMm ?? sharedSheet?.sheetWidthMm,
      sheetHeightMm: materialForMeasure?.sheetHeightMm ?? sharedSheet?.sheetHeightMm,
      allowRotate: line.allowRotate !== false,
      manualPerSheet: line.manualPerSheet,
    });
    const times = finite(line.times) && line.times > 0 ? line.times : 1;
    const measured = "missing" in measuredRaw ? measuredRaw : { ...measuredRaw, value: measuredRaw.value * times };
    if ("missing" in measured) {
      base.lines.push({ lineId: line.lineId, name: lineName, kind: line.kind, status: "missing", reason: measured.missing });
      pushNamed(base.missing, lineName, measured.missing);
      continue;
    }
    if (line.kind === "material") {
      const material = library.materials.find((row) => row.id === line.refId);
      if (!material) {
        base.lines.push({ lineId: line.lineId, name: line.refId, kind: "material", status: "missing", reason: "원자재가 없습니다." });
        pushNamed(base.missing, line.refId, "원자재가 없습니다.");
        continue;
      }
      const shareSheet = line.usage === "per-sheet-imposition" && material.sheetCharge === "share" && finite(measured.perSheet) && measured.perSheet > 0;
      const billedQty = shareSheet ? (input.qty / measured.perSheet!) * times : measured.value;
      const cost = materialCost(material, billedQty, vatRate, asOf);
      const once = line.usage === "per-order";
      const unitByMaterial = { m: "m", m2: "㎡", sheet: "장", ea: "개" } as const;
      const fixedUnit = unitByMaterial[material.usageUnit];
      const shareNote = shareSheet
        ? `사용량 비례. 한 장에 ${measured.perSheet}개 중 ${input.qty}개라 판재 ${Math.round(billedQty * 1000) / 1000}장분입니다. 남은 판재는 다시 쓸 수 있다고 보고 계산하며, 로스는 이 수량에 한 번 적용합니다.`
        : undefined;
      const fullNote = line.usage === "per-sheet-imposition" && !shareSheet
        ? `${measured.note ?? ""} 판재 전체 사용이라 필요한 장수만큼 재료비를 계산합니다.`.trim()
        : measured.note;
      if (material.price.note?.includes("가상") || material.price.status === "code-reference") base.usesVirtualCost = true;
      base.lines.push({
        lineId: line.lineId,
        name: material.label,
        kind: "material",
        usageQty: shareSheet ? billedQty : measured.value,
        unitLabel: line.usage === "per-piece" ? fixedUnit : measured.unitLabel,
        grossAmount: cost.gross,
        supplyCost: cost.supply,
        variableCost: once ? 0 : cost.supply,
        fixedCost: once ? cost.supply : 0,
        status: cost.reason ? "missing" : cost.status ?? "missing",
        reason: cost.reason,
        usageNote: line.usage === "per-piece"
          ? `개당 고정 ${times}${fixedUnit}입니다. 가로·세로는 이 줄에 반영되지 않습니다.`
          : shareNote ?? fullNote,
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
    const equipment = process.equipmentId ? library.equipment.find((row) => row.id === process.equipmentId) : undefined;
    const chargeSetup = !process.equipmentId || !setupCharged.has(process.equipmentId);
    if (process.equipmentId && chargeSetup) setupCharged.add(process.equipmentId);
    const equipmentSetup = equipment?.setup?.amount != null ? equipment.setup : undefined;
    if (equipmentSetup && process.setup?.amount != null && chargeSetup) {
      base.warnings.push(`${process.label}: 장비 준비비와 공정 기본비가 둘 다 있어 장비 준비비만 한 번 계산했습니다.`);
    }
    const cost = processCost(process, measured.value, input.qty, vatRate, asOf, {
      chargeSetup,
      setupPrice: equipmentSetup ?? process.setup,
    });
    const notes = [measured.note];
    if (cost.setupSkipped) notes.push("같은 장비 준비비는 이 주문에서 이미 한 번 계산해 여기서는 빼 두었습니다.");
    if (cost.floorApplied) notes.push("계산액이 최소 작업비보다 낮아 최소 작업비로 맞췄습니다. 준비비에 최소 작업비를 더하지 않았습니다.");
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
      usageNote: notes.filter(Boolean).join(" "),
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
      if (finite(recipe.minimumSupplyPrice) && recipe.minimumSupplyPrice > 0) {
        base.productMinimumSupply = ceilToNearest10(recipe.minimumSupplyPrice);
      }
      const targetPrice = base.target?.supplyPrice;
      if (finite(targetPrice) || finite(base.productMinimumSupply)) {
        base.recommendedSupplyPrice = Math.max(targetPrice ?? 0, base.productMinimumSupply ?? 0);
      }
    }
    const limits = [recipe.reviewAboveQty, ...recipe.lines.map((line) => library.processes.find((row) => row.id === line.refId)?.reviewAboveQty)];
    const limit = limits.filter((value): value is number => finite(value) && value > 0).sort((a, b) => a - b)[0];
    if (limit != null && input.qty > limit) base.capacityWarning = "관리자 확인 필요";
    const floor = recipe.legacyQuoteId === "sticker-sheet" ? config.settings.minStickerSupply : undefined;
    const fromMargin = base.minimum?.supplyPrice;
    if (finite(fromMargin) || finite(floor)) {
      base.minimumSalePrice = Math.max(fromMargin ?? 0, floor ?? 0);
    }
    const processLines = base.lines.filter((row) => row.kind === "process");
    const processMoney = processLines.reduce((sum, row) => sum + (row.supplyCost ?? 0), 0);
    base.laborUnpriced = processLines.length === 0 || processMoney <= 0;
    if (base.laborUnpriced) {
      base.warnings.push("작업비가 원가에 없습니다. 이 추천 공급가는 재료비만 반영하므로 그대로 믿지 마세요.");
    }
    base.referenceSimulation = base.references.length > 0;
    base.approvalAllowed = !base.referenceSimulation && !base.laborUnpriced && finite(base.target?.supplyPrice);
  }

  const sameProcess = library.processes.find((process) =>
    process.label.trim() !== ""
    && process.label.trim() === recipe.label.trim()
    && recipe.lines.some((line) => line.kind === "process" && line.refId === process.id)
  );
  if (sameProcess) {
    base.warnings.push(`품목 이름과 공정 이름 '${recipe.label}'이 같습니다. 판매 품목은 에코백 DTF 인쇄처럼 적고, 열프레스는 공정으로 두세요.`);
  }
  const hasRollLayout = recipe.lines.some((line) => line.kind === "material" && line.usage === "per-meter-layout");
  const hasMeterProcess = recipe.lines.some((line) => {
    if (line.kind !== "process") return false;
    return library.processes.find((process) => process.id === line.refId)?.method === "per-m";
  });
  if (hasRollLayout && hasMeterProcess) {
    base.warnings.push("필름 배치 길이와 미터당 공정비가 함께 있습니다. 출력비가 두 번 들어가지 않았는지 확인하세요.");
  }
  const hasInk = recipe.lines.some((line) => line.kind === "material" && (library.materials.find((row) => row.id === line.refId)?.label ?? "").includes("잉크"));
  const hasPrint = recipe.lines.some((line) => line.kind === "process" && (library.processes.find((row) => row.id === line.refId)?.label ?? "").includes("출력"));
  if (hasInk && hasPrint) {
    base.warnings.push("잉크를 원자재로 두었습니다. 출력 공정비에 잉크값을 다시 넣지 않았는지 확인하세요.");
  }
  const orderRefs = recipe.lines.filter((line) => line.usage === "per-order").map((line) => line.refId);
  if (orderRefs.some((refId, index) => orderRefs.indexOf(refId) !== index)) {
    base.warnings.push("같은 공정의 주문당 고정비가 두 번 들어 있습니다.");
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
