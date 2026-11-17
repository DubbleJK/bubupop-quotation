/**
 * 공통: 반올림(10원 단위), VAT·총액 계산
 */
/** 고객 판매가에 쓰는 10원 반올림. 추천 공급가에는 쓰지 않는다. */
export function roundToNearest10(value: number): number {
  return Math.round(value / 10) * 10;
}

/** 추천 공급가 전용 10원 올림. 이미 10원 단위면 그대로 둔다. */
export function ceilToNearest10(value: number): number {
  const scaled = Math.round(value * 1000) / 1000 / 10;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) < 1e-9) return nearest * 10;
  return Math.ceil(scaled - 1e-9) * 10;
}

export interface VatAndTotal {
  vat: number;
  total: number;
}

export const EMPTY_VAT: VatAndTotal = { vat: 0, total: 0 };

/**
 * 부가세가 이미 포함된 최종 금액을 공급가와 부가세로 나눈다.
 * 두 금액의 합은 최종 금액과 같다.
 */
export function splitIncludedTotal(total: number, vatRate: number): { supplyPrice: number; vat: number; total: number } {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(vatRate) || vatRate < 0) {
    return { supplyPrice: 0, vat: 0, total: 0 };
  }
  const supplyPrice = roundToNearest10(total / (1 + vatRate));
  const roundedVat = roundToNearest10(supplyPrice * vatRate);
  const vat = supplyPrice + roundedVat === total ? roundedVat : total - supplyPrice;
  return { supplyPrice, vat, total };
}

export function calcVatAndTotal(
  supplyPrice: number,
  vatRate: number
): VatAndTotal {
  if (!Number.isFinite(supplyPrice) || !Number.isFinite(vatRate)) {
    return { ...EMPTY_VAT };
  }
  const vat = roundToNearest10(supplyPrice * vatRate);
  const total = roundToNearest10(supplyPrice + vat);
  return { vat, total };
}
