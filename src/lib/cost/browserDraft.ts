import type { CostLibrary } from "./types";

/** 서버 KV가 없을 때 이 브라우저에만 남기는 임시 원가. 판매 설정 키와 분리한다. */
export const BROWSER_DRAFT_KEY = "quotation_cost_library_browser_draft";

export function parseCostLibraryDraft(raw: string | null): CostLibrary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CostLibrary;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.materials) || !Array.isArray(parsed.processes) || !Array.isArray(parsed.recipes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readBrowserDraft(): CostLibrary | null {
  if (typeof window === "undefined") return null;
  return parseCostLibraryDraft(window.localStorage.getItem(BROWSER_DRAFT_KEY));
}

export function writeBrowserDraft(library: CostLibrary) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_DRAFT_KEY, JSON.stringify(library));
}

export function clearBrowserDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BROWSER_DRAFT_KEY);
}
