import type { MaterialCost } from "./types";

export type PriceBasis = "per-purchase" | "per-usage";

/**
 * 저장값에 구매 방식이 없으면 기존 계산을 유지한다.
 * 롤이면서 가격 단위가 미터이고 금액이 1만 원 미만이면, 이미 미터 가격인데 롤 길이로 다시 나눈 경우로 본다.
 * DTF 필름처럼 15만 원 롤 가격은 이 조건에 들어가지 않아 길이로 한 번만 나눈다.
 */
export function inferPriceBasis(material: MaterialCost): PriceBasis {
  if (material.priceBasis === "per-purchase" || material.priceBasis === "per-usage") return material.priceBasis;
  if (material.purchaseUnit === material.usageUnit) return "per-usage";
  const amount = material.price.amount;
  const conversion = material.conversion;
  if (
    material.purchaseUnit === "roll"
    && material.usageUnit === "m"
    && material.price.unit === "krw-per-m"
    && typeof amount === "number"
    && typeof conversion === "number"
    && conversion > 1
    && amount > 0
    && amount < 10000
  ) {
    return "per-usage";
  }
  return "per-purchase";
}

export function usageUnitPrice(
  material: MaterialCost,
  vatRate: number,
  asOf: string
): { amount?: number; basis: PriceBasis; reason?: string } {
  const basis = inferPriceBasis(material);
  const price = material.price;
  if (!price || price.status === "unconfirmed" || typeof price.amount !== "number" || !Number.isFinite(price.amount)) {
    return { basis, reason: "매입가가 미등록입니다." };
  }
  if (!price.effectiveFrom || price.effectiveFrom > asOf) return { basis, reason: "매입가 적용일 전입니다." };
  if (price.tax === "inclusive" && (!Number.isFinite(vatRate) || vatRate < 0)) return { basis, reason: "매입가가 미등록입니다." };
  const exclusive = price.tax === "inclusive" ? price.amount / (1 + vatRate) : price.amount;
  if (basis === "per-usage" || material.purchaseUnit === material.usageUnit) {
    return { amount: exclusive, basis: "per-usage" };
  }
  if (material.conversionStatus !== "confirmed" || typeof material.conversion !== "number" || material.conversion <= 0) {
    return { basis, reason: "단위 환산이 미등록입니다." };
  }
  return { amount: exclusive / material.conversion, basis: "per-purchase" };
}
