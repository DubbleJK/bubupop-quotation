import { COST_LIBRARY_KEY, QUOTE_LOG_KEY, assertLibraryKeepsUsedRows, emptyCostLibrary, withLibraryRevision } from "@/lib/cost/library";
import type { CostLibrary } from "@/lib/cost/types";
import { devFileStoreEnabled, readDevJson, writeDevJson } from "@/server/devStore";
import { kvReadJson, kvWriteJson } from "@/server/kvJson";

const DEV_FILE = "dev-cost-library.json";

export { COST_LIBRARY_KEY, QUOTE_LOG_KEY };

function isLibrary(value: unknown): value is CostLibrary {
  if (!value || typeof value !== "object") return false;
  const row = value as CostLibrary;
  return Array.isArray(row.materials) && Array.isArray(row.processes) && Array.isArray(row.recipes);
}

export async function readCostLibrary(): Promise<
  | { state: "unconfigured" }
  | { state: "error" }
  | { state: "empty"; where: "kv" | "dev-file" }
  | { state: "ok"; where: "kv" | "dev-file"; library: CostLibrary }
> {
  const stored = await kvReadJson(COST_LIBRARY_KEY);
  if (stored.state === "error") return { state: "error" };
  if (stored.state === "ok") {
    const raw = typeof stored.value === "string" ? (JSON.parse(stored.value) as unknown) : stored.value;
    if (!isLibrary(raw)) return { state: "empty", where: "kv" };
    return { state: "ok", where: "kv", library: raw };
  }
  if (stored.state === "empty") return { state: "empty", where: "kv" };
  if (!devFileStoreEnabled()) return { state: "unconfigured" };
  const file = readDevJson(DEV_FILE);
  if (file.state === "error") return { state: "error" };
  if (file.state === "ok" && isLibrary(file.value)) return { state: "ok", where: "dev-file", library: file.value };
  return { state: "empty", where: "dev-file" };
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
  if (current.where === "dev-file") {
    const written = writeDevJson(DEV_FILE, library);
    if (!written.ok) return { ok: false, reason: "error" };
    return { ok: true, library };
  }
  const written = await kvWriteJson(COST_LIBRARY_KEY, library);
  if (!written.ok) return written;
  return { ok: true, library };
}
