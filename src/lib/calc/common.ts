/**
 * 공통: 반올림(10원 단위), VAT·총액 계산
 */
export function roundToNearest10(value: number): number {
  return Math.round(value / 10) * 10;
}

export interface VatAndTotal {
  vat: number;
  total: number;
}

export const EMPTY_VAT: VatAndTotal = { vat: 0, total: 0 };

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
