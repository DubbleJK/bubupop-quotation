import { QUOTE_LOG_KEY } from "@/lib/cost/library";
import { kvReadJson, kvWriteJson } from "@/server/kvJson";

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

export async function readQuoteLog(): Promise<
  | { state: "unconfigured" | "empty" | "error" }
  | { state: "ok"; entries: QuoteHistoryEntry[] }
> {
  const stored = await kvReadJson(QUOTE_LOG_KEY);
  if (stored.state !== "ok") return { state: stored.state };
  const raw = typeof stored.value === "string" ? (JSON.parse(stored.value) as unknown) : stored.value;
  if (!Array.isArray(raw)) return { state: "empty" };
  return { state: "ok", entries: raw.filter(isEntry) };
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
  const entries = [...(current.state === "ok" ? current.entries : []), saved].slice(-200);
  const written = await kvWriteJson(QUOTE_LOG_KEY, entries);
  if (!written.ok) return written;
  return { ok: true, entry: saved };
}
