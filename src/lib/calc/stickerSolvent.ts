/**
 * 스티커 솔벤트 롤: 네스팅 길이, 공급가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface StickerSolventInput {
  widthMm: number;
  heightMm: number;
  qty: number;
  gapMm: number;
}

export interface StickerSolventResult {
  lengthM: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function calcStickerSolvent(
  input: StickerSolventInput,
  s: Pick<Settings, "solventRollWidthMm" | "workFeeSolvent" | "popSellPerM4" | "vatRate">
): StickerSolventResult {
  const { widthMm: w, heightMm: h, qty, gapMm: g } = input;
  const rollW = s.solventRollWidthMm;

  const acrossA = Math.floor(rollW / (w + g));
  const rowsA = Math.ceil(qty / Math.max(acrossA, 1));
  const lenA = rowsA * (h + g);

  const acrossB = Math.floor(rollW / (h + g));
  const rowsB = Math.ceil(qty / Math.max(acrossB, 1));
  const lenB = rowsB * (w + g);

  const lengthM = Math.min(lenA, lenB) / 1000;
  const supplyPrice = roundToNearest10(s.workFeeSolvent + lengthM * s.popSellPerM4);

  return {
    lengthM,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
