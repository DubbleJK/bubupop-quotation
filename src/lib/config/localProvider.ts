import type { ConfigProvider } from "./provider";
import type { AppConfig, BusinessCardDesignTier } from "./types";
import { ADMIN_CONFIG_KEY, ADMIN_DEFAULT_CONFIG_KEY } from "./storageKeys";

const OUTPUT_ONLY_TIER: BusinessCardDesignTier = { id: "output-only", label: "출력만", fee: 0 };

function ensureOutputOnlyTier(tiers: BusinessCardDesignTier[]): BusinessCardDesignTier[] {
  const has = tiers.some((t) => t.id === "output-only");
  if (has) return tiers;
  return [OUTPUT_ONLY_TIER, ...tiers];
}
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

function getFileConfig(): AppConfig {
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

/**
 * V1: 로컬 config + 파일 기본값.
 * 서버(KV)에 저장된 설정이 있으면 우선 사용 → 기기/재접속 시에도 유지.
 * 없으면 localStorage, 그다음 코드 기본값.
 */
export const localProvider: ConfigProvider = {
  async getAllConfig(): Promise<AppConfig> {
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const parsed = (await res.json()) as AppConfig;
          if (parsed?.settings && parsed?.products) {
            parsed.businessCardDesignTiers = ensureOutputOnlyTier(
              parsed.businessCardDesignTiers ?? []
            );
            try {
              localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(parsed));
            } catch {
              // ignore
            }
            return parsed;
          }
        }
      } catch {
        // API 실패 시 아래 localStorage/파일 사용
      }
      try {
        const saved = localStorage.getItem(ADMIN_CONFIG_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppConfig;
          if (parsed?.settings && parsed?.products) {
            parsed.businessCardDesignTiers = ensureOutputOnlyTier(
              parsed.businessCardDesignTiers ?? []
            );
            return parsed;
          }
        }
      } catch {
        // ignore invalid saved config
      }
    }
    return getFileConfig();
  },

  async getDefaultConfig(): Promise<AppConfig> {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(ADMIN_DEFAULT_CONFIG_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppConfig;
          if (parsed?.settings && parsed?.products) {
            parsed.businessCardDesignTiers = ensureOutputOnlyTier(
              parsed.businessCardDesignTiers ?? []
            );
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return getFileConfig();
  },
};
