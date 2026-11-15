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
  internal?: {
    supplyCost?: number;
    minimumSupplyPrice?: number;
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

function entriesOf(value: unknown): QuoteHistoryEntry[] | null {
  const raw = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return null;
  return raw.filter(isEntry);
}

export function trimQuoteLog<T>(entries: T[], limit = QUOTE_LOG_LIMIT): T[] {
  return entries.slice(-limit);
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
    const entries = entriesOf(stored.value);
    if (!entries) return { state: "empty", where: "kv" };
    return { state: "ok", where: "kv", entries };
  }
  if (stored.state === "empty") return { state: "empty", where: "kv" };
  if (!devFileStoreEnabled()) return { state: "unconfigured" };
  const file = readDevJson(DEV_FILE);
  if (file.state === "error") return { state: "error" };
  if (file.state === "ok") {
    const entries = entriesOf(file.value);
    if (!entries) return { state: "empty", where: "dev-file" };
    return { state: "ok", where: "dev-file", entries };
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
