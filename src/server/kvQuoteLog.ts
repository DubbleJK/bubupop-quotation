import { QUOTE_LOG_KEY, QUOTE_LOG_LIMIT } from "@/lib/cost/library";
import { devFileStoreEnabled, readDevJson, writeDevJson } from "@/server/devStore";
import { kvReadJson, kvWriteJson } from "@/server/kvJson";

const DEV_FILE = "dev-quote-log.json";

export interface QuoteHistoryEntry {
  id: string;
  createdAt: string;
  productId: string;
  input: Record<string, number | string>;
  salePolicyRevision: number;
  costLibraryRevision: number;
  marginPolicyRevision: number;
  presentedSupplyPrice: number;
  presentedVat: number;
  presentedTotal: number;
  staffName?: string;
  customerName?: string;
  adjustmentReason?: string;
  /** 추천가와 다른 공급가를 이 조건에서 다시 확인했는지. */
  priceConfirmed?: boolean;
  internal?: {
    supplyCost?: number;
    minimumSupplyPrice?: number;
    recommendedSupplyPrice?: number;
    targetSupplyPrice?: number;
    highSupplyPrice?: number;
    profit?: number;
    marginRate?: number;
    missing: string[];
    lines?: unknown;
  };
}

function isEntry(value: unknown): value is QuoteHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as QuoteHistoryEntry;
  return typeof row.id === "string" && typeof row.productId === "string";
}

export function parseQuoteLog(value: unknown): { ok: true; entries: QuoteHistoryEntry[] } | { ok: false } {
  let raw = value;
  for (let depth = 0; depth < 2 && typeof raw === "string"; depth += 1) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false };
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as { entries?: unknown }).entries)) {
    raw = (raw as { entries: unknown[] }).entries;
  }
  if (!Array.isArray(raw)) return { ok: false };
  return { ok: true, entries: raw.filter(isEntry) };
}

export function trimQuoteLog<T>(entries: T[], limit = QUOTE_LOG_LIMIT): T[] {
  return entries.slice(-limit);
}

export function dropQuoteEntry(
  entries: QuoteHistoryEntry[],
  id: string
): { ok: true; entries: QuoteHistoryEntry[] } | { ok: false; reason: "not_found" } {
  if (!entries.some((entry) => entry.id === id)) return { ok: false, reason: "not_found" };
  return { ok: true, entries: entries.filter((entry) => entry.id !== id) };
}

export async function readQuoteLog(): Promise<
  | { state: "unconfigured" }
  | { state: "error" }
  | { state: "empty"; where: "kv" | "dev-file" }
  | { state: "ok"; where: "kv" | "dev-file"; entries: QuoteHistoryEntry[] }
> {
  const stored = await kvReadJson(QUOTE_LOG_KEY);
  if (stored.state === "error") return { state: "error" };
  if (stored.state === "ok") {
    const parsed = parseQuoteLog(stored.value);
    if (!parsed.ok) return { state: "error" };
    return { state: "ok", where: "kv", entries: parsed.entries };
  }
  if (stored.state === "empty") return { state: "empty", where: "kv" };
  if (!devFileStoreEnabled()) return { state: "unconfigured" };
  const file = readDevJson(DEV_FILE);
  if (file.state === "error") return { state: "error" };
  if (file.state === "ok") {
    const parsed = parseQuoteLog(file.value);
    if (!parsed.ok) return { state: "error" };
    return { state: "ok", where: "dev-file", entries: parsed.entries };
  }
  return { state: "empty", where: "dev-file" };
}

export async function appendQuoteLog(
  entry: Omit<QuoteHistoryEntry, "id" | "createdAt">
): Promise<{ ok: true; entry: QuoteHistoryEntry } | { ok: false; reason: "unconfigured" | "error" | "forbidden" }> {
  const current = await readQuoteLog();
  if (current.state === "error") return { ok: false, reason: "error" };
  if (current.state === "unconfigured") return { ok: false, reason: "unconfigured" };
  const saved: QuoteHistoryEntry = {
    ...entry,
    id: `quote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const entries = trimQuoteLog([...(current.state === "ok" ? current.entries : []), saved]);
  if (current.where === "dev-file") {
    const written = writeDevJson(DEV_FILE, entries);
    if (!written.ok) return { ok: false, reason: "error" };
    return { ok: true, entry: saved };
  }
  const written = await kvWriteJson(QUOTE_LOG_KEY, entries);
  if (!written.ok) return written;
  return { ok: true, entry: saved };
}

export async function removeQuoteLog(
  id: string
): Promise<{ ok: true } | { ok: false; reason: "unconfigured" | "error" | "forbidden" | "not_found" }> {
  const current = await readQuoteLog();
  if (current.state === "error") return { ok: false, reason: "error" };
  if (current.state === "unconfigured") return { ok: false, reason: "unconfigured" };
  const dropped = dropQuoteEntry(current.state === "ok" ? current.entries : [], id);
  if (!dropped.ok) return dropped;
  if (current.where === "dev-file") {
    const written = writeDevJson(DEV_FILE, dropped.entries);
    if (!written.ok) return { ok: false, reason: "error" };
    return { ok: true };
  }
  return kvWriteJson(QUOTE_LOG_KEY, dropped.entries);
}
