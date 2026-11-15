import type { CostLibrary } from "./types";

export const CATALOG_PAGE_SIZE = 25;
export const PICKER_LIMIT = 8;
export const PROCESS_CATEGORIES = ["인쇄", "전사", "커팅", "후가공", "디자인", "포장"] as const;
export const RECENT_KEY = "quotation_cost_recent_ids";

export function linkCount(library: CostLibrary, kind: "material" | "process", id: string): number {
  return library.recipes.filter((recipe) => recipe.lines.some((line) => line.kind === kind && line.refId === id)).length;
}

export function catalogPage<T>(rows: T[], page: number, size = CATALOG_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { rows: rows.slice(start, start + size), page: current, pages, total: rows.length, start };
}

export function sortByNameOrRecent<T extends { label: string; updatedAt?: string; history?: { at: string }[] }>(
  rows: T[],
  mode: "name" | "recent"
): T[] {
  const stamp = (row: T) => row.updatedAt || row.history?.[row.history.length - 1]?.at || "";
  return [...rows].sort((a, b) => {
    if (mode === "recent") {
      const byTime = stamp(b).localeCompare(stamp(a));
      if (byTime !== 0) return byTime;
    }
    return a.label.localeCompare(b.label, "ko");
  });
}

export function matchesQuery(label: string, spec: string, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return label.toLowerCase().includes(text) || spec.toLowerCase().includes(text);
}

export function rememberId(ids: string[], id: string, max = PICKER_LIMIT): string[] {
  return [id, ...ids.filter((item) => item !== id)].slice(0, max);
}

export function pickSuggestions<T extends { id: string; label: string; favorite?: boolean }>(
  rows: T[],
  query: string,
  recentIds: string[],
  limit = PICKER_LIMIT
): { matches: T[]; favorites: T[]; recent: T[] } {
  const text = query.trim().toLowerCase();
  if (text) {
    return { matches: rows.filter((row) => row.label.toLowerCase().includes(text)).slice(0, limit), favorites: [], recent: [] };
  }
  const favorites = rows.filter((row) => row.favorite).slice(0, limit);
  const recent = recentIds
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is T => Boolean(row))
    .slice(0, limit);
  return { matches: [], favorites, recent };
}
