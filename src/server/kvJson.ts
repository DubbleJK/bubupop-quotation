import { kvCredentialsPresent } from "@/server/kvConfig";

const SALE_CONFIG_KEY = "quotation_admin_config";

/** 판매 설정 키에는 쓰지 않는다. */
export async function kvReadJson(key: string): Promise<
  | { state: "unconfigured" }
  | { state: "empty" }
  | { state: "error" }
  | { state: "ok"; value: unknown }
> {
  if (key === SALE_CONFIG_KEY) return { state: "error" };
  if (!kvCredentialsPresent()) return { state: "unconfigured" };
  try {
    const { kv } = await import("@vercel/kv");
    const value = await kv.get<unknown>(key);
    if (value == null) return { state: "empty" };
    return { state: "ok", value };
  } catch {
    console.error("[kv] read failed");
    return { state: "error" };
  }
}

export async function kvWriteJson(
  key: string,
  value: unknown
): Promise<{ ok: true } | { ok: false; reason: "unconfigured" | "error" | "forbidden" }> {
  if (key === SALE_CONFIG_KEY) return { ok: false, reason: "forbidden" };
  if (!kvCredentialsPresent()) return { ok: false, reason: "unconfigured" };
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, JSON.stringify(value));
    return { ok: true };
  } catch {
    console.error("[kv] write failed");
    return { ok: false, reason: "error" };
  }
}
