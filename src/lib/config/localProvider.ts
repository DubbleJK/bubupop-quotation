import type { ConfigProvider } from "./provider";
import type { AppConfig } from "./types";
import { ADMIN_CONFIG_KEY, ADMIN_DEFAULT_CONFIG_KEY } from "./storageKeys";
import { cloneConfig, getFileConfig, normalizeConfig } from "./fileConfig";
import { toPublicConfig } from "./publicConfig";
import { resolveQuoteConfig, type QuoteConfigResolution, type ServerConfigProbe } from "./resolveQuoteConfig";

/** 구형 모바일 Safari 등에서 `AbortSignal.timeout`이 없을 때 대비 */
function fetchConfigWithTimeout(url: string, ms: number): Promise<Response> {
  const signalTimeout = (
    AbortSignal as typeof AbortSignal & { timeout?: (delay: number) => AbortSignal }
  ).timeout;
  if (typeof signalTimeout === "function") {
    return fetch(url, { signal: signalTimeout(ms) });
  }
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/** 서버 확인이 끝난 공개 설정만 담는다. 브라우저 저장값을 확인 전에 넣지 않는다. */
let memoryConfig: AppConfig | null = null;

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
    localStorage.setItem(key, JSON.stringify(toPublicConfig(config)));
  } catch {
    // ignore storage write failures
  }
}

async function probeServerConfig(): Promise<ServerConfigProbe> {
  try {
    const res = await fetchConfigWithTimeout("/api/config", 8000);
    if (res.status === 404) return { status: "absent" };
    if (!res.ok) return { status: "unavailable" };
    const parsed = (await res.json()) as AppConfig;
    if (!parsed?.settings || !parsed?.products) return { status: "absent" };
    return { status: "ok", config: parsed };
  } catch {
    return { status: "unavailable" };
  }
}

export const localProvider: ConfigProvider = {
  getInitialConfig(): AppConfig {
    if (memoryConfig) return cloneConfig(memoryConfig);
    return cloneConfig(normalizeConfig(getFileConfig()));
  },

  async loadQuoteConfig(): Promise<QuoteConfigResolution> {
    const server = await probeServerConfig();
    const browserConfig = typeof window === "undefined" ? null : readSavedConfig(ADMIN_CONFIG_KEY);
    const resolution = resolveQuoteConfig({
      server,
      browserConfig,
      fileConfig: getFileConfig(),
    });
    if (resolution.ready && resolution.source === "server") {
      memoryConfig = resolution.config;
      writeSavedConfig(ADMIN_CONFIG_KEY, resolution.config);
    }
    return resolution;
  },

  async getAllConfig(): Promise<AppConfig> {
    const resolution = await this.loadQuoteConfig();
    if (!resolution.ready) {
      throw new Error("server-unreachable");
    }
    return cloneConfig(resolution.config);
  },

  rememberServerConfig(config: AppConfig): void {
    const publicConfig = toPublicConfig(normalizeConfig(config));
    memoryConfig = publicConfig;
    writeSavedConfig(ADMIN_CONFIG_KEY, publicConfig);
  },

  async getDefaultConfig(): Promise<AppConfig> {
    const saved = readSavedConfig(ADMIN_DEFAULT_CONFIG_KEY);
    if (saved) {
      return toPublicConfig(saved);
    }
    return toPublicConfig(normalizeConfig(getFileConfig()));
  },
};
