import type { AppConfig } from "./types";
import { normalizeConfig } from "./fileConfig";
import { toPublicConfig } from "./publicConfig";
import { readConfigMeta } from "./configMeta";

export type ConfigSource = "server" | "browser" | "default";

export type ServerConfigProbe =
  | { status: "ok"; config: AppConfig }
  | { status: "absent" }
  | { status: "unavailable" };

export type QuoteConfigResolution =
  | {
      ready: true;
      source: ConfigSource;
      config: AppConfig;
      revision: number;
      updatedAt: string | null;
    }
  | {
      ready: false;
      reason: "server-unreachable";
    };

/**
 * 서버 응답을 확인한 뒤에만 견적 설정을 확정한다.
 * 서버에 도달하지 못하면 브라우저 저장값으로 견적을 만들지 않는다.
 * 서버가 "저장된 설정 없음"이라고 답한 뒤에만 브라우저 저장값 또는 코드 기본값을 쓴다.
 */
export function resolveQuoteConfig(input: {
  server: ServerConfigProbe;
  browserConfig: AppConfig | null;
  fileConfig: AppConfig;
}): QuoteConfigResolution {
  if (input.server.status === "unavailable") {
    return { ready: false, reason: "server-unreachable" };
  }

  if (input.server.status === "ok") {
    const config = toPublicConfig(normalizeConfig(input.server.config));
    const meta = readConfigMeta(config);
    return {
      ready: true,
      source: "server",
      config,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
    };
  }

  if (input.browserConfig) {
    const config = toPublicConfig(normalizeConfig(input.browserConfig));
    const meta = readConfigMeta(config);
    return {
      ready: true,
      source: "browser",
      config,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
    };
  }

  const config = toPublicConfig(normalizeConfig(input.fileConfig));
  return {
    ready: true,
    source: "default",
    config,
    revision: 0,
    updatedAt: null,
  };
}

export function describeQuoteSource(result: Extract<QuoteConfigResolution, { ready: true }>): string {
  const version = `버전 ${result.revision}`;
  const when = result.updatedAt ? ` · ${result.updatedAt}` : "";
  if (result.source === "server") return `서버 설정 · ${version}${when}`;
  if (result.source === "browser") {
    return `서버에 저장된 설정이 없습니다. 이 브라우저에 남아 있는 설정을 사용합니다. ${version}${when}`;
  }
  return "기존 8개 품목의 판매단가는 코드 기본값입니다. 원가 기반 품목은 서버에 저장된 원가를 사용합니다.";
}
