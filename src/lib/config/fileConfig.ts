import type { AppConfig, BusinessCardDesignTier } from "./types";
import { settings } from "@/config/settings";
import { products } from "@/config/products";
import {
  stickerRates,
  stickerSheetSizes,
  tshirtTypes,
  tshirtSizeUpPer2XL,
  tshirtDiscountTiers,
  businessCardOptions,
  businessCardDesignTiers,
} from "@/config/rates";

const OUTPUT_ONLY_TIER: BusinessCardDesignTier = { id: "output-only", label: "출력만", fee: 0 };

function ensureOutputOnlyTier(tiers: BusinessCardDesignTier[]): BusinessCardDesignTier[] {
  const has = tiers.some((t) => t.id === "output-only");
  if (has) return tiers;
  return [OUTPUT_ONLY_TIER, ...tiers];
}

export function cloneConfig(config: AppConfig): AppConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

/**
 * 구버전 JSON에는 나중에 추가된 품목이 없을 수 있다.
 * 코드에 있는 품목 id를 항상 채우고, 저장본에 라벨이 있으면 그 라벨을 유지한다.
 */
export function mergeProductCatalog(saved: AppConfig["products"] | undefined): AppConfig["products"] {
  const baseline = products.map((p) => ({ id: p.id, label: p.label }));
  if (!saved?.length) return baseline;

  const savedById = new Map(saved.map((p) => [p.id, p]));
  return baseline.map((def) => {
    const s = savedById.get(def.id);
    if (!s) return def;
    const label = typeof s.label === "string" && s.label.trim() !== "" ? s.label : def.label;
    return { id: def.id, label };
  });
}

export function normalizeConfig(config: AppConfig): AppConfig {
  const next = cloneConfig(config);
  next.products = mergeProductCatalog(next.products);
  next.businessCardDesignTiers = ensureOutputOnlyTier(next.businessCardDesignTiers ?? []);
  return next;
}

/** 코드에 있는 판매 기본값. 인증 비밀값은 포함하지 않는다. */
export function getFileConfig(): AppConfig {
  return {
    settings: { ...settings },
    products: products.map((p) => ({ id: p.id, label: p.label })),
    stickerRates: { ...stickerRates } as AppConfig["stickerRates"],
    stickerSheetSizes: { ...stickerSheetSizes },
    tshirtTypes: tshirtTypes.map((t) => ({ id: t.id, label: t.label, unitPrice: t.unitPrice })),
    tshirtSizeUpPer2XL,
    tshirtDiscountTiers: tshirtDiscountTiers.map((t) => ({ minQty: t.minQty, rate: t.rate })),
    businessCardOptions: businessCardOptions.map((o) => {
      const item: { id: string; label: string; prices: Record<number, number>; note?: string } = {
        id: o.id,
        label: o.label,
        prices: { ...o.prices },
      };
      if ("note" in o && o.note !== undefined) item.note = o.note;
      return item;
    }),
    businessCardDesignTiers: businessCardDesignTiers.map((t) => ({
      id: t.id,
      label: t.label,
      fee: t.fee,
    })),
  };
}
