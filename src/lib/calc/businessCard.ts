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
  ok: boolean;
  error?: string;
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
  const registeredPrice =
    opt && input.pcs != null && input.pcs >= 1 ? opt.prices[input.pcs] : undefined;
  if (!opt) {
    return {
      ok: false,
      error: "등록되지 않은 용지 옵션입니다.",
      printPrice: 0,
      designFee: 0,
      supplyPrice: 0,
      vatAndTotal: { vat: 0, total: 0 },
    };
  }
  if (registeredPrice == null) {
    return {
      ok: false,
      error: "등록되지 않은 매수입니다.",
      printPrice: 0,
      designFee: 0,
      supplyPrice: 0,
      vatAndTotal: { vat: 0, total: 0 },
    };
  }
  const printPrice = registeredPrice;
  const designFee = tier?.fee ?? 0;
  const supplyPrice = roundToNearest10(printPrice + designFee);

  return {
    ok: true,
    printPrice,
    designFee,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
  };
}
