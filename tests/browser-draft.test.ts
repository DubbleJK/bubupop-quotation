import { describe, expect, it } from "vitest";
import { BROWSER_DRAFT_KEY, parseCostLibraryDraft } from "../src/lib/cost/browserDraft";
import { COST_LIBRARY_KEY } from "../src/lib/cost/library";
import { KV_CONFIG_KEY } from "../src/server/kvConfig";

describe("브라우저 임시 원가", () => {
  it("판매 설정 키와 서버 원가 키를 쓰지 않는다", () => {
    expect(BROWSER_DRAFT_KEY).not.toBe(KV_CONFIG_KEY);
    expect(BROWSER_DRAFT_KEY).not.toBe(COST_LIBRARY_KEY);
  });

  it("원자재와 공정과 품목이 있는 내용만 읽는다", () => {
    expect(parseCostLibraryDraft(null)).toBeNull();
    expect(parseCostLibraryDraft("{")).toBeNull();
    expect(parseCostLibraryDraft(JSON.stringify({ materials: [] }))).toBeNull();
    const library = parseCostLibraryDraft(JSON.stringify({ materials: [], processes: [], recipes: [], margins: [], equipment: [], revision: 0, updatedAt: null }));
    expect(library?.recipes).toEqual([]);
  });
});
