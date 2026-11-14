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
  ok: boolean;
  error?: string;
  lengthM: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

function orientationLengthMm(
  rollW: number,
  acrossMm: number,
  alongMm: number,
  qty: number,
  gapMm: number
): number | null {
  const across = Math.floor(rollW / (acrossMm + gapMm));
  if (across < 1) return null;
  const rows = Math.ceil(qty / across);
  return rows * (alongMm + gapMm);
}

export function calcStickerSolvent(
  input: StickerSolventInput,
  s: Pick<Settings, "solventRollWidthMm" | "workFeeSolvent" | "solventSellPerM" | "popSellPerM4" | "vatRate">
): StickerSolventResult {
  const { widthMm: w, heightMm: h, qty, gapMm: g } = input;
  const rollW = s.solventRollWidthMm;
  const sellPerM = s.solventSellPerM ?? s.popSellPerM4;

  const lenA = orientationLengthMm(rollW, w, h, qty, g);
  const lenB = orientationLengthMm(rollW, h, w, qty, g);
  if (lenA == null && lenB == null) {
    return {
      ok: false,
      error: `롤 폭(${rollW}mm)을 초과하여 견적할 수 없습니다.`,
      lengthM: 0,
      supplyPrice: 0,
      vatAndTotal: { vat: 0, total: 0 },
    };
  }

  const lengthMm = Math.min(...[lenA, lenB].filter((value): value is number => value != null));
  const lengthM = lengthMm / 1000;
  const supplyPrice = roundToNearest10(s.workFeeSolvent + lengthM * sellPerM);

  return {
    ok: true,
    lengthM,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
