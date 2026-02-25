/**
 * 스티커 시트형 (A4/A3): 장당 수량, 매수, 시간, 공급가 (최소 20,000원)
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";
import type { SheetSize, StickerRateItem } from "@/lib/config/types";

export interface StickerSheetInput {
  materialKey: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  gapMm: number;
}

export interface StickerSheetSheetResult {
  perSheet: number;
  sheets: number;
  minutes: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
  disabled?: boolean;
  disabledReason?: string;
}

export interface StickerSheetResult {
  a4: StickerSheetSheetResult;
  a3: StickerSheetSheetResult;
}

function usableSize(sheet: SheetSize, trimMargin: number): { w: number; h: number } {
  return {
    w: sheet.width - trimMargin * 2,
    h: sheet.height - trimMargin * 2,
  };
}

function perSheetCapacity(
  sheetW: number,
  sheetH: number,
  stickerW: number,
  stickerH: number,
  gap: number
): number {
  const perA = Math.floor(sheetW / (stickerW + gap)) * Math.floor(sheetH / (stickerH + gap));
  const perB = Math.floor(sheetW / (stickerH + gap)) * Math.floor(sheetH / (stickerW + gap));
  return Math.max(perA, perB, 1);
}

export function calcStickerSheet(
  input: StickerSheetInput,
  s: Pick<
    Settings,
    "trimMarginMm" | "workFeeStickerSheet" | "minStickerSupply" | "stickerCutSecondsPerSheet" | "vatRate"
  >,
  sheetSizes: { a4: SheetSize; a3: SheetSize },
  rate: StickerRateItem
): StickerSheetResult {
  const { widthMm: w, heightMm: h, qty, gapMm: gap } = input;
  const trim = s.trimMarginMm;
  const workFee = s.workFeeStickerSheet;
  const minSupply = s.minStickerSupply;
  const secPerSheet = s.stickerCutSecondsPerSheet;

  const a4Usable = usableSize(sheetSizes.a4, trim);
  const a3Usable = usableSize(sheetSizes.a3, trim);

  const calcOne = (
    sheetW: number,
    sheetH: number,
    sellPerSheet: number,
    available: boolean,
    disabledReason?: string
  ): StickerSheetSheetResult => {
    if (!available) {
      return {
        perSheet: 0,
        sheets: 0,
        minutes: 0,
        supplyPrice: 0,
        vatAndTotal: { vat: 0, total: 0 },
        disabled: true,
        disabledReason: disabledReason ?? "A3 불가",
      };
    }
    const perSheet = perSheetCapacity(sheetW, sheetH, w, h, gap);
    const sheets = Math.ceil(qty / perSheet);
    const minutes = Math.ceil((sheets * secPerSheet) / 60);
    const supplyPrice = roundToNearest10(
      Math.max(workFee + sheets * sellPerSheet, minSupply)
    );
    return {
      perSheet,
      sheets,
      minutes,
      supplyPrice,
      vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
    };
  };

  return {
    a4: calcOne(a4Usable.w, a4Usable.h, rate.a4, true),
    a3: calcOne(
      a3Usable.w,
      a3Usable.h,
      rate.a3,
      rate.a3Available,
      "A3 불가"
    ),
  };
}
