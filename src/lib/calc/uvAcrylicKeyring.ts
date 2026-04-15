/**
 * UV 아크릴 키링 견적 계산 모듈
 * - 추후 다른 상품군 확장을 위해 규칙/구간을 상수화
 */
export interface UvAcrylicKeyringInput {
  width: number;
  height: number;
  qty: number;
}

export interface UvAcrylicKeyringQuote {
  width: number;
  height: number;
  qty: number;
  area: number;
  quantityBracket: string;
  unitSupplyPrice: number;
  supplyTotal: number;
  vat: number;
  baseTotal: number;
  adjustmentRate: number;
  adjustmentLabel: string;
  finalPrice: number;
}

const VAT_RATE = 0.1;
const SINGLE_QTY_AREA_THRESHOLD = 8.4;
const SINGLE_QTY_SMALL_AREA_PRICE = 5800;
const SINGLE_QTY_LARGE_AREA_PRICE = 6000;

interface UnitPriceTier {
  minQty: number;
  maxQty: number;
  base: number;
  areaMultiplier: number;
  bracketLabel: string;
}

const UNIT_PRICE_TIERS: UnitPriceTier[] = [
  { minQty: 2, maxQty: 10, base: 1700, areaMultiplier: 13.7, bracketLabel: "2~10개" },
  { minQty: 11, maxQty: 50, base: 1195, areaMultiplier: 14.8, bracketLabel: "11~50개" },
  { minQty: 51, maxQty: 100, base: 1145, areaMultiplier: 14.1, bracketLabel: "51~100개" },
  { minQty: 101, maxQty: 200, base: 1069, areaMultiplier: 14.0, bracketLabel: "101~200개" },
  { minQty: 201, maxQty: 300, base: 1053, areaMultiplier: 13.6, bracketLabel: "201~300개" },
  { minQty: 301, maxQty: 400, base: 1040, areaMultiplier: 13.5, bracketLabel: "301~400개" },
  { minQty: 401, maxQty: 500, base: 1030, areaMultiplier: 13.56, bracketLabel: "401~500개" },
  { minQty: 501, maxQty: Number.POSITIVE_INFINITY, base: 1013, areaMultiplier: 13.61, bracketLabel: "501개 이상" },
];

interface AdjustmentPolicy {
  minQty: number;
  maxQty: number;
  rate: number;
  label: string;
}

const ADJUSTMENT_POLICIES: AdjustmentPolicy[] = [
  { minQty: 1, maxQty: 10, rate: 1.1, label: "+10%" },
  { minQty: 11, maxQty: 49, rate: 1.07, label: "+7%" },
  { minQty: 50, maxQty: 200, rate: 1.05, label: "+5%" },
  { minQty: 201, maxQty: 299, rate: 1.02, label: "+2%" },
  { minQty: 300, maxQty: Number.POSITIVE_INFINITY, rate: 0.99, label: "-1%" },
];

export function getArea(width: number, height: number): number {
  return (width * height) / 100;
}

export function getUnitSupplyPrice(area: number, qty: number): number {
  if (qty === 1) {
    return area <= SINGLE_QTY_AREA_THRESHOLD
      ? SINGLE_QTY_SMALL_AREA_PRICE
      : SINGLE_QTY_LARGE_AREA_PRICE;
  }

  const tier = UNIT_PRICE_TIERS.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!tier) {
    throw new Error("수량 구간을 찾을 수 없습니다.");
  }

  return Math.round(tier.base + area * tier.areaMultiplier);
}

function getQuantityBracketLabel(qty: number): string {
  if (qty === 1) {
    return "1개";
  }
  const tier = UNIT_PRICE_TIERS.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!tier) return "구간 없음";
  return tier.bracketLabel;
}

export function getVat(supplyTotal: number): number {
  return Math.round(supplyTotal * VAT_RATE);
}

export function getBaseTotal(supplyTotal: number, vat: number): number {
  return supplyTotal + vat;
}

export function getAdjustmentRate(qty: number): number {
  const policy = ADJUSTMENT_POLICIES.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!policy) {
    throw new Error("가격 정책 구간을 찾을 수 없습니다.");
  }
  return policy.rate;
}

function getAdjustmentLabel(qty: number): string {
  const policy = ADJUSTMENT_POLICIES.find((item) => qty >= item.minQty && qty <= item.maxQty);
  if (!policy) return "미적용";
  return policy.label;
}

export function getAdjustedFinalPrice(baseTotal: number, qty: number): number {
  return Math.round(baseTotal * getAdjustmentRate(qty));
}

export function calculateQuote(input: UvAcrylicKeyringInput): UvAcrylicKeyringQuote {
  const area = getArea(input.width, input.height);
  const unitSupplyPrice = getUnitSupplyPrice(area, input.qty);
  const supplyTotal = unitSupplyPrice * input.qty;
  const vat = getVat(supplyTotal);
  const baseTotal = getBaseTotal(supplyTotal, vat);
  const adjustmentRate = getAdjustmentRate(input.qty);
  const finalPrice = getAdjustedFinalPrice(baseTotal, input.qty);

  return {
    width: input.width,
    height: input.height,
    qty: input.qty,
    area,
    quantityBracket: getQuantityBracketLabel(input.qty),
    unitSupplyPrice,
    supplyTotal,
    vat,
    baseTotal,
    adjustmentRate,
    adjustmentLabel: getAdjustmentLabel(input.qty),
    finalPrice,
  };
}

/**
 * 검증용 레퍼런스 데이터
 * 요구된 5개 케이스를 상수로 남겨 수동 검증 시 즉시 비교 가능
 */
export const UV_ACRYLIC_KEYRING_TEST_CASES = [
  { width: 45, height: 30, qty: 1, expectedFinalPrice: 7260 },
  { width: 45, height: 30, qty: 100, expectedFinalPrice: 154193 },
  { width: 47, height: 47, qty: 200, expectedFinalPrice: 318318 },
  { width: 50, height: 50, qty: 500, expectedFinalPrice: 745421 },
  { width: 47, height: 47, qty: 1000, expectedFinalPrice: 1430946 },
] as const;

