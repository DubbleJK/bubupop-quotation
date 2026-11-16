import type { AppConfig } from "@/lib/config/types";
import type { CostLibrary, SimulationInput } from "./types";
import { simulatePricing } from "./pricing";
import { quoteStage } from "./recipeHealth";

export interface QuoteSaveCheck {
  productId: string;
  input: SimulationInput;
  presentedSupplyPrice: number;
  supplyCost?: number;
  recommendedSupplyPrice?: number;
  priceConfirmed?: boolean;
}

/** 저장 직전에 서버가 다시 계산해 이전 조건의 금액이 섞이지 않게 한다. */
export function rejectQuoteSave(
  library: CostLibrary,
  config: AppConfig,
  entry: QuoteSaveCheck,
  asOf: string
): string | null {
  const recipe = library.recipes.find((row) => row.productId === entry.productId);
  if (!recipe || recipe.legacyQuoteId) return null;
  const stage = quoteStage(library, recipe);
  if (stage === "hidden" || stage === "incomplete") return "설정이 끝나지 않은 품목은 확정 견적으로 저장하지 않습니다.";
  const result = simulatePricing(library, config, entry.input, asOf);
  if (result.missing.length > 0 || result.recommendedSupplyPrice == null || result.supplyCost == null) {
    return "지금 조건으로는 견적을 확정할 수 없습니다.";
  }
  if (entry.supplyCost != null && entry.supplyCost !== result.supplyCost) return "견적 조건이 바뀌었습니다. 다시 확인한 뒤 저장하세요.";
  if (entry.recommendedSupplyPrice != null && entry.recommendedSupplyPrice !== result.recommendedSupplyPrice) {
    return "견적 조건이 바뀌었습니다. 다시 확인한 뒤 저장하세요.";
  }
  if (entry.presentedSupplyPrice !== result.recommendedSupplyPrice && entry.priceConfirmed !== true) {
    return "직접 수정한 공급가는 이 조건에서 다시 확인한 뒤에 저장할 수 있습니다.";
  }
  return null;
}
