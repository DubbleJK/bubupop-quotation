import { costPersistence } from "@/server/devStore";
import { readDevJson, writeDevJson } from "@/server/devStore";
import { kvCredentialsPresent } from "@/server/kvConfig";
import { kvReadJson, kvWriteJson } from "@/server/kvJson";

const KEY = "quotation_staff_access";
const DEV_FILE = "dev-staff-access.json";

interface StaffAccess {
  pin?: string;
}

function readPin(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const pin = (value as StaffAccess).pin;
  return typeof pin === "string" && pin.length > 0 ? pin : null;
}

/** 관리자가 저장하기 전에는 직원 PIN이 없다. 기본값은 만들지 않는다. */
export async function readStaffPin(): Promise<string | null> {
  const where = costPersistence(kvCredentialsPresent());
  if (where === "kv") {
    const stored = await kvReadJson(KEY);
    if (stored.state !== "ok") return null;
    const raw = typeof stored.value === "string" ? (JSON.parse(stored.value) as unknown) : stored.value;
    return readPin(raw);
  }
  if (where === "dev-file") {
    const file = readDevJson(DEV_FILE);
    return file.state === "ok" ? readPin(file.value) : null;
  }
  return null;
}

export async function writeStaffPin(pin: string): Promise<{ ok: true } | { ok: false; reason: "unconfigured" | "error" }> {
  const where = costPersistence(kvCredentialsPresent());
  const body = { pin };
  if (where === "kv") {
    const written = await kvWriteJson(KEY, body);
    return written.ok ? { ok: true } : { ok: false, reason: written.reason === "forbidden" ? "error" : written.reason };
  }
  if (where === "dev-file") {
    const written = writeDevJson(DEV_FILE, body);
    return written.ok ? { ok: true } : { ok: false, reason: "error" };
  }
  return { ok: false, reason: "unconfigured" };
}
