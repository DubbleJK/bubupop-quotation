/**
 * POP: 소비 길이 계산 및 4-cut/2-cut 공급가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface PopInput {
  widthMm: number;
  heightMm: number;
  qty: number;
}

export interface PopResultItem {
  supplyPrice: number;
  vat: number;
  total: number;
}

export interface PopResult {
  error?: string;
  lengthMm: number;
  lengthM: number;
  supply4Cut: number;
  supply2Cut: number;
  vatAndTotal4: VatAndTotal;
  vatAndTotal2: VatAndTotal;
}

export function calcPop(
  input: PopInput,
  s: Pick<Settings, "popRollWidthMm" | "popSellPerM4" | "popSellPerM2" | "vatRate">
): PopResult {
  const { widthMm: w, heightMm: h, qty } = input;
  const rollWidth = s.popRollWidthMm;

  if (w > rollWidth && h > rollWidth) {
    return {
      error: "폭 초과(610mm) - 사이즈 확인",
      lengthMm: 0,
      lengthM: 0,
      supply4Cut: 0,
      supply2Cut: 0,
      vatAndTotal4: { vat: 0, total: 0 },
      vatAndTotal2: { vat: 0, total: 0 },
    };
  }

  let lengthMm: number;
  if (w <= rollWidth && h <= rollWidth) {
    lengthMm = Math.min(w, h);
  } else if (w <= rollWidth) {
    lengthMm = h;
  } else {
    lengthMm = w;
  }

  const lengthM = (lengthMm / 1000) * qty;
  const supply4Cut = roundToNearest10(lengthM * s.popSellPerM4);
  const supply2Cut = roundToNearest10(lengthM * s.popSellPerM2);

  return {
    lengthMm,
    lengthM,
    supply4Cut,
    supply2Cut,
    vatAndTotal4: calcVatAndTotal(supply4Cut, s.vatRate),
    vatAndTotal2: calcVatAndTotal(supply2Cut, s.vatRate),
  };
}
