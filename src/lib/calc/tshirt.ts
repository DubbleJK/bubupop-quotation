/**
 * 티셔츠: 타입별 단가, 2XL+ 추가금, 수량 할인
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";
import type { TshirtTypeItem, TshirtDiscountTier } from "@/lib/config/types";

export interface TshirtInput {
  typeId: string;
  qty: number;
  numberOf2XLPlus: number;
}

export interface TshirtResult {
  unitPrice: number;
  discountRate: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

function getDiscountRate(qty: number, tiers: TshirtDiscountTier[]): number {
  for (const t of tiers) {
    if (qty >= t.minQty) return t.rate;
  }
  return 0;
}

export function calcTshirt(
  input: TshirtInput,
  s: Pick<Settings, "vatRate">,
  typeItem: TshirtTypeItem | undefined,
  sizeUpPer2XL: number,
  discountTiers: TshirtDiscountTier[]
): TshirtResult {
  const unitPrice = typeItem?.unitPrice ?? 0;
  const base = unitPrice * input.qty;
  const sizeUp = input.numberOf2XLPlus * sizeUpPer2XL;
  const subtotal = base + sizeUp;
  const discountRate = getDiscountRate(input.qty, discountTiers);
  const supplyPrice = roundToNearest10(subtotal * (1 - discountRate));

  return {
    unitPrice,
    discountRate,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
