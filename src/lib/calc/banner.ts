/**
 * 배너: 출력물 수량 × 기본가 + 실내 거치대 수량 × 단가 + 실외 거치대 수량 × 단가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface BannerInput {
  /** 출력물 수량 (1장당 bannerBasePrice) */
  outputQty: number;
  /** 실내 거치대 수량 */
  indoorStandQty: number;
  /** 실외 거치대 수량 */
  outdoorStandQty: number;
}

export interface BannerResult {
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function calcBanner(
  input: BannerInput,
  s: Pick<Settings, "bannerBasePrice" | "bannerStandIndoor" | "bannerStandOutdoor" | "vatRate">
): BannerResult {
  const { outputQty, indoorStandQty, outdoorStandQty } = input;
  const supplyPrice = roundToNearest10(
    outputQty * s.bannerBasePrice +
      indoorStandQty * s.bannerStandIndoor +
      outdoorStandQty * s.bannerStandOutdoor
  );

  return {
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
