import { describe, expect, it } from "vitest";
import { catalogPage, linkCount, matchesQuery, pickSuggestions, rememberId, sortByNameOrRecent } from "../src/lib/cost/catalog";
import type { CostLibrary, MaterialCost } from "../src/lib/cost/types";

function material(index: number, kind = "필름"): MaterialCost {
  return {
    id: `mat-${index}`,
    label: `재료 ${String(index).padStart(3, "0")}`,
    kind,
    spec: `${index}mm`,
    active: true,
    purchaseUnit: "ea",
    usageUnit: "ea",
    conversionStatus: "unconfirmed",
    price: { amount: 1000 + index, unit: "krw-per-ea", tax: "exclusive", status: "confirmed", effectiveFrom: "2026-01-01" },
    wasteRate: 0,
    wasteStatus: "confirmed",
    history: [],
  };
}

describe("목록형 원자재와 공정 선택", () => {
  it("500개도 25개씩 나뉘고 검색은 한 건만 고른다", () => {
    const rows = Array.from({ length: 500 }, (_, index) => material(index + 1));
    const first = catalogPage(sortByNameOrRecent(rows, "name"), 1);
    const last = catalogPage(sortByNameOrRecent(rows, "name"), 20);
    expect(first.rows).toHaveLength(25);
    expect(first.pages).toBe(20);
    expect(last.rows).toHaveLength(25);
    expect(last.page).toBe(20);
    const found = rows.filter((row) => matchesQuery(row.label, row.spec, "재료 499"));
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("mat-499");
  });

  it("이름을 바꿔도 품목 연결은 같은 ID를 유지한다", () => {
    const source = material(1);
    const library = {
      recipes: [
        {
          productId: "bag",
          label: "에코백",
          active: true,
          lines: [{ lineId: "line-1", refId: source.id, kind: "material" as const, usage: "per-piece" as const }],
          showOnCustomerQuote: false,
        },
      ],
    } as CostLibrary;
    const renamed = { ...library, recipes: library.recipes, materials: [{ ...source, label: "새 에코백 원단" }] };
    expect(linkCount(renamed, "material", source.id)).toBe(1);
    expect(renamed.recipes[0]?.lines[0]?.refId).toBe(source.id);
  });

  it("검색어가 없으면 즐겨찾기와 최근 항목만 8개까지 보여 준다", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ ...material(index + 1), favorite: index < 3 }));
    const recent = rememberId([], "mat-80");
    const idle = pickSuggestions(rows, "", recent);
    const typed = pickSuggestions(rows, "재료 099", recent);
    expect(idle.matches).toHaveLength(0);
    expect(idle.favorites.length).toBeLessThanOrEqual(8);
    expect(idle.recent.map((row) => row.id)).toEqual(["mat-80"]);
    expect(typed.matches).toHaveLength(1);
  });

  it("최근 수정이 이름보다 앞에 온다", () => {
    const older = { ...material(1), updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer = { ...material(2), updatedAt: "2026-11-15T00:00:00.000Z" };
    expect(sortByNameOrRecent([older, newer], "recent")[0]?.id).toBe(newer.id);
    expect(sortByNameOrRecent([newer, older], "name")[0]?.label.localeCompare("재료 002", "ko")).toBeLessThan(0);
  });
});
