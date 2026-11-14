import { COST_LIBRARY_KEY, QUOTE_LOG_KEY, assertLibraryKeepsUsedRows, emptyCostLibrary, withLibraryRevision } from "@/lib/cost/library";
import type { CostLibrary } from "@/lib/cost/types";
import { kvReadJson, kvWriteJson } from "@/server/kvJson";

export { COST_LIBRARY_KEY, QUOTE_LOG_KEY };

function isLibrary(value: unknown): value is CostLibrary {
  if (!value || typeof value !== "object") return false;
  const row = value as CostLibrary;
  return Array.isArray(row.materials) && Array.isArray(row.processes) && Array.isArray(row.recipes);
}

export async function readCostLibrary(): Promise<
  | { state: "unconfigured" | "empty" | "error" }
  | { state: "ok"; library: CostLibrary }
> {
  const stored = await kvReadJson(COST_LIBRARY_KEY);
  if (stored.state !== "ok") return { state: stored.state };
  const raw = typeof stored.value === "string" ? (JSON.parse(stored.value) as unknown) : stored.value;
  if (!isLibrary(raw)) return { state: "empty" };
  return { state: "ok", library: raw };
}

/** 원가 키만 쓴다. 판매 설정 키는 호출하지 않는다. */
export async function writeCostLibrary(
  incoming: CostLibrary
): Promise<{ ok: true; library: CostLibrary } | { ok: false; reason: "unconfigured" | "error" | "forbidden" | "in_use" }> {
  const current = await readCostLibrary();
  if (current.state === "error") return { ok: false, reason: "error" };
  if (current.state === "unconfigured") return { ok: false, reason: "unconfigured" };
  const previous = current.state === "ok" ? current.library : emptyCostLibrary();
  const blocked = assertLibraryKeepsUsedRows(previous, incoming);
  if (blocked) return { ok: false, reason: "in_use" };
  const library = withLibraryRevision(current.state === "ok" ? current.library : null, incoming);
  const written = await kvWriteJson(COST_LIBRARY_KEY, library);
  if (!written.ok) return written;
  return { ok: true, library };
}
