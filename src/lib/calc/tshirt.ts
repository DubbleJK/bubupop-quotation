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

export interface TshirtPriceBand {
  from: number;
  to: number;
  qty: number;
  rate: number;
  amount: number;
}

export interface TshirtResult {
  unitPrice: number;
  bands: TshirtPriceBand[];
  garmentPrice: number;
  discountAmount: number;
  sizeUp: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function tshirtSizeError(qty: number, numberOf2XLPlus: number): string | null {
  if (numberOf2XLPlus > qty) return "2XL 이상 수량은 총수량을 초과할 수 없습니다";
  return null;
}

/** 할인율은 그 구간에 들어온 수량에만 적용한다. */
export function tshirtPriceBands(unitPrice: number, qty: number, tiers: TshirtDiscountTier[]): TshirtPriceBand[] {
  const ordered = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const starts = [1, ...ordered.map((tier) => tier.minQty).filter((minQty) => minQty > 1)];
  const bands: TshirtPriceBand[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index];
    if (from > qty) break;
    const next = starts[index + 1] ?? qty + 1;
    const to = Math.min(qty, next - 1);
    const count = to - from + 1;
    const rate = ordered.filter((tier) => tier.minQty <= from).at(-1)?.rate ?? 0;
    bands.push({
      from,
      to,
      qty: count,
      rate,
      amount: unitPrice * (1 - rate) * count,
    });
  }
  return bands;
}

export function calcTshirt(
  input: TshirtInput,
  s: Pick<Settings, "vatRate">,
  typeItem: TshirtTypeItem | undefined,
  sizeUpPer2XL: number,
  discountTiers: TshirtDiscountTier[]
): TshirtResult {
  const unitPrice = typeItem?.unitPrice ?? 0;
  const bands = tshirtPriceBands(unitPrice, input.qty, discountTiers);
  const garmentPrice = bands.reduce((sum, band) => sum + band.amount, 0);
  const discountAmount = unitPrice * input.qty - garmentPrice;
  const sizeUp = input.numberOf2XLPlus * sizeUpPer2XL;
  const supplyPrice = roundToNearest10(garmentPrice + sizeUp);

  return {
    unitPrice,
    bands,
    garmentPrice,
    discountAmount,
    sizeUp,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
