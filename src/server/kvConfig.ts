import type { AppConfig } from "@/lib/config/types";
import { normalizeConfig } from "@/lib/config/fileConfig";

/** 기존 키를 유지한다. 다른 키를 만들거나 운영 데이터를 이 모듈 로드만으로 쓰지 않는다. */
export const KV_CONFIG_KEY = "quotation_admin_config";

function kvEnv(name: "KV_REST_API_URL" | "KV_REST_API_TOKEN"): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function kvCredentialsPresent(): boolean {
  return kvEnv("KV_REST_API_URL") !== undefined && kvEnv("KV_REST_API_TOKEN") !== undefined;
}

export type KvReadResult =
  | { state: "unconfigured" }
  | { state: "empty" }
  | { state: "ok"; config: AppConfig }
  | { state: "error" };

function parseStored(raw: unknown): AppConfig | null {
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!value || typeof value !== "object") return null;
  const config = value as AppConfig;
  if (!config.settings || !config.products) return null;
  return normalizeConfig(config);
}

/** 읽기만 한다. 자격 증명이 없으면 KV 클라이언트를 만들지 않는다. */
export async function readKvConfig(): Promise<KvReadResult> {
  if (!kvCredentialsPresent()) return { state: "unconfigured" };
  try {
    const { kv } = await import("@vercel/kv");
    const raw = await kv.get<unknown>(KV_CONFIG_KEY);
    if (raw == null) return { state: "empty" };
    const config = parseStored(raw);
    if (!config) return { state: "empty" };
    return { state: "ok", config };
  } catch {
    return { state: "error" };
  }
}

export async function writeKvConfig(config: AppConfig): Promise<{ ok: true } | { ok: false; reason: "unconfigured" | "error" }> {
  if (!kvCredentialsPresent()) return { ok: false, reason: "unconfigured" };
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch {
    console.error("[kv] config write failed");
    return { ok: false, reason: "error" };
  }
}
