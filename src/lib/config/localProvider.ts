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

let memoryConfig: AppConfig | null = null;

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

function cloneConfig(config: AppConfig): AppConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

function normalizeConfig(config: AppConfig): AppConfig {
  const next = cloneConfig(config);
  next.businessCardDesignTiers = ensureOutputOnlyTier(next.businessCardDesignTiers ?? []);
  return next;
}

function readSavedConfig(key: string): AppConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as AppConfig;
    if (!parsed?.settings || !parsed?.products) return null;
    return normalizeConfig(parsed);
  } catch {
    return null;
  }
}

function writeSavedConfig(key: string, config: AppConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // ignore storage write failures
  }
}

/**
 * V1: 로컬 config + 파일 기본값.
 * 서버(KV)에 저장된 설정이 있으면 우선 사용 → 기기/재접속 시에도 유지.
 * 없으면 localStorage, 그다음 코드 기본값.
 */
export const localProvider: ConfigProvider = {
  getInitialConfig(): AppConfig {
    if (memoryConfig) return cloneConfig(memoryConfig);

    const saved = readSavedConfig(ADMIN_CONFIG_KEY);
    if (saved) {
      memoryConfig = saved;
      return cloneConfig(saved);
    }

    const fileConfig = normalizeConfig(getFileConfig());
    memoryConfig = fileConfig;
    return cloneConfig(fileConfig);
  },

  async getAllConfig(): Promise<AppConfig> {
    if (typeof window !== "undefined") {
      const saved = readSavedConfig(ADMIN_CONFIG_KEY);
      if (saved) {
        memoryConfig = saved;

        // 초기 응답은 빠르게 반환하고, 백그라운드에서 최신 서버 설정을 동기화한다.
        void (async () => {
          try {
            const res = await fetch("/api/config");
            if (!res.ok) return;
            const parsed = normalizeConfig((await res.json()) as AppConfig);
            memoryConfig = parsed;
            writeSavedConfig(ADMIN_CONFIG_KEY, parsed);
          } catch {
            // ignore
          }
        })();

        return cloneConfig(saved);
      }

      try {
        const res = await fetch("/api/config", { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const parsed = normalizeConfig((await res.json()) as AppConfig);
          if (parsed?.settings && parsed?.products) {
            memoryConfig = parsed;
            writeSavedConfig(ADMIN_CONFIG_KEY, parsed);
            return cloneConfig(parsed);
          }
        }
      } catch {
        // API 실패 시 아래 localStorage/파일 사용
      }

      if (memoryConfig) {
        return cloneConfig(memoryConfig);
      }
    }

    const fallback = normalizeConfig(getFileConfig());
    memoryConfig = fallback;
    return cloneConfig(fallback);
  },

  async getDefaultConfig(): Promise<AppConfig> {
    const saved = readSavedConfig(ADMIN_DEFAULT_CONFIG_KEY);
    if (saved) {
      return cloneConfig(saved);
    }
    const fallback = normalizeConfig(getFileConfig());
    return cloneConfig(fallback);
  },
};
