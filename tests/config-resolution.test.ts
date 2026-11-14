import { afterEach, describe, expect, it } from "vitest";
import { getFileConfig, normalizeConfig } from "@/lib/config/fileConfig";
import { toPublicConfig, containsLoginPin } from "@/lib/config/publicConfig";
import { readConfigMeta, withNextRevision } from "@/lib/config/configMeta";
import { resolveQuoteConfig } from "@/lib/config/resolveQuoteConfig";
import { kvCredentialsPresent } from "@/server/kvConfig";
import { pinsMatch, sessionSecret, signAdminSession, verifyAdminSession } from "@/server/adminSession";
import type { AppConfig } from "@/lib/config/types";

const file = getFileConfig();

function withPin(pin: string): AppConfig {
  return {
    ...file,
    settings: { ...file.settings, loginPin: pin },
    configMeta: { revision: 4, updatedAt: "2026-01-01T00:00:00.000Z" },
  };
}

describe("공개 설정과 버전", () => {
  it("코드 기본 설정에는 인증 비밀값이 없다", () => {
    expect(containsLoginPin(file)).toBe(false);
    expect(file.settings.loginPin).toBeUndefined();
  });

  it("공개 변환은 PIN을 제거하고 가격과 버전은 유지한다", () => {
    const stored = withPin("zz-pin");
    stored.settings.popSellPerM4 = 111;
    const pub = toPublicConfig(stored);
    expect(containsLoginPin(pub)).toBe(false);
    expect(JSON.stringify(pub)).not.toContain("zz-pin");
    expect(pub.settings.popSellPerM4).toBe(111);
    expect(readConfigMeta(pub)).toEqual({ revision: 4, updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("구버전 JSON은 버전 0으로 읽고, 저장 시 서버에 있던 버전만 올린다", () => {
    const legacy = normalizeConfig({ ...file, products: file.products.slice(0, 3) });
    delete legacy.configMeta;
    expect(readConfigMeta(legacy).revision).toBe(0);
    expect(legacy.products.some((item) => item.id === "uv-acrylic-keyring")).toBe(true);

    const clientForged = {
      ...legacy,
      configMeta: { revision: 99, updatedAt: "1999-01-01T00:00:00.000Z" },
    };
    const now = new Date("2026-03-01T00:00:00.000Z");
    const next = withNextRevision(clientForged, legacy, now);
    expect(next.configMeta).toEqual({ revision: 1, updatedAt: "2026-03-01T00:00:00.000Z" });
  });
});

describe("견적 설정 확정", () => {
  const browser = withPin("1111");
  browser.settings.bannerBasePrice = 1;

  it("서버를 확인하기 전에는 브라우저 설정으로 견적을 확정하지 않는다", () => {
    const result = resolveQuoteConfig({
      server: { status: "unavailable" },
      browserConfig: browser,
      fileConfig: file,
    });
    expect(result.ready).toBe(false);
  });

  it("서버 설정이 있으면 브라우저 값보다 서버 값을 쓴다", () => {
    const server = withPin("2222");
    server.settings.bannerBasePrice = 22000;
    const result = resolveQuoteConfig({
      server: { status: "ok", config: server },
      browserConfig: browser,
      fileConfig: file,
    });
    expect(result.ready).toBe(true);
    if (!result.ready) return;
    expect(result.source).toBe("server");
    expect(result.revision).toBe(4);
    expect(result.config.settings.bannerBasePrice).toBe(22000);
    expect(containsLoginPin(result.config)).toBe(false);
  });

  it("서버에 설정이 없다고 확인된 뒤에만 브라우저 저장값을 쓴다", () => {
    const result = resolveQuoteConfig({
      server: { status: "absent" },
      browserConfig: browser,
      fileConfig: file,
    });
    expect(result.ready).toBe(true);
    if (!result.ready) return;
    expect(result.source).toBe("browser");
    expect(result.config.settings.bannerBasePrice).toBe(1);
    expect(containsLoginPin(result.config)).toBe(false);
  });

  it("서버와 브라우저 저장값이 모두 없으면 코드 기본값이다", () => {
    const result = resolveQuoteConfig({
      server: { status: "absent" },
      browserConfig: null,
      fileConfig: file,
    });
    expect(result.ready).toBe(true);
    if (!result.ready) return;
    expect(result.source).toBe("default");
    expect(result.revision).toBe(0);
    expect(result.config.settings.minStickerSupply).toBe(20000);
  });
});

describe("KV 자격 증명 확인", () => {
  const prevUrl = process.env.KV_REST_API_URL;
  const prevToken = process.env.KV_REST_API_TOKEN;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = prevUrl;
    if (prevToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = prevToken;
  });

  it("환경변수가 없으면 KV를 호출할 자격이 없다", () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    expect(kvCredentialsPresent()).toBe(false);
  });

  it("URL과 토큰이 둘 다 있을 때만 연결 가능으로 본다", () => {
    process.env.KV_REST_API_URL = "https://example.test";
    process.env.KV_REST_API_TOKEN = "token";
    expect(kvCredentialsPresent()).toBe(true);
  });
});

describe("관리자 세션", () => {
  it("PIN 비교는 값만 맞고 로그를 남기지 않는다", () => {
    expect(pinsMatch("0000", "0000")).toBe(true);
    expect(pinsMatch("0000", "9999")).toBe(false);
    expect(pinsMatch("0000", "00000")).toBe(false);
  });

  it("서명한 세션만 통과한다", () => {
    const token = signAdminSession(1_700_000_000_000);
    expect(token).toBeTruthy();
    expect(verifyAdminSession(token ?? undefined, 1_700_000_000_000)).toBe(true);
    expect(verifyAdminSession("1.2.3", 1_700_000_000_000)).toBe(false);
  });

  it("프로덕션에서 세션 비밀이 없으면 세션을 만들지 않는다", () => {
    const prevNode = process.env.NODE_ENV;
    const prevSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_SESSION_SECRET;
    expect(sessionSecret()).toBeNull();
    expect(signAdminSession()).toBeNull();
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = prevSecret;
  });
});
