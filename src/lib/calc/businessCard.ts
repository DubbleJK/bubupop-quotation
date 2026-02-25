/**
 * 명함: 용지 옵션 + 디자인 등급에 따른 공급가
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";
import type { BusinessCardOption, BusinessCardDesignTier } from "@/lib/config/types";

export interface BusinessCardInput {
  paperOptionId: string;
  designTierId: string;
  /** 선택한 용지의 pcs (100, 200, 500 등) */
  pcs?: number;
}

export interface BusinessCardResult {
  printPrice: number;
  designFee: number;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
}

export function calcBusinessCard(
  input: BusinessCardInput,
  s: Pick<Settings, "vatRate">,
  options: BusinessCardOption[],
  designTiers: BusinessCardDesignTier[]
): BusinessCardResult {
  const opt = options.find((o) => o.id === input.paperOptionId);
  const tier = designTiers.find((t) => t.id === input.designTierId);
  const printPrice = opt && input.pcs ? (opt.prices[input.pcs] ?? 0) : 0;
  const designFee = tier?.fee ?? 0;
  const supplyPrice = roundToNearest10(printPrice + designFee);

  return {
    printPrice,
    designFee,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
