import { describe, expect, it } from "vitest";
import { emptyCostLibrary } from "../src/lib/cost/library";
import { buildPublicCatalog, customerQuoteBlockReason, listedLegacyIds } from "../src/lib/cost/publicCatalog";
import type { CostLibrary } from "../src/lib/cost/types";

function library(): CostLibrary {
  const base = emptyCostLibrary();
  return {
    ...base,
    groups: [
      { id: "goods", label: "굿즈·아크릴", sortOrder: 1, active: true },
      { id: "print", label: "인쇄·홍보물", sortOrder: 0, active: true },
      { id: "off", label: "숨긴 그룹", sortOrder: 2, active: false },
    ],
    recipes: base.recipes.map((recipe) => {
      if (recipe.legacyQuoteId === "pop") return { ...recipe, groupId: "print", sortOrder: 1, description: "실내용" };
      if (recipe.legacyQuoteId === "banner") return { ...recipe, groupId: "print", sortOrder: 0 };
      if (recipe.legacyQuoteId === "dtf") return { ...recipe, customerVisible: false };
      if (recipe.legacyQuoteId === "tshirt") return { ...recipe, groupId: "off" };
      if (recipe.legacyQuoteId === "uv-acrylic-keyring") return { ...recipe, groupId: "goods", sortOrder: 0 };
      return recipe;
    }).concat({
      productId: "new-item",
      label: "새 키링",
      active: true,
      lines: [],
      showOnCustomerQuote: false,
      customerVisible: true,
      approvedSupplyPrice: 10000,
      description: "내부 원가 500원",
    }),
  };
}

describe("고객 첫 화면 목록", () => {
  it("기존 8개만 기본 표시하고 숨긴 품목과 새 품목은 빼며 원가를 넣지 않는다", () => {
    const catalog = buildPublicCatalog(emptyCostLibrary());
    expect(listedLegacyIds(catalog)).toEqual([
      "pop",
      "sticker-sheet",
      "sticker-solvent",
      "uv-acrylic-keyring",
      "dtf",
      "tshirt",
      "business-card",
      "banner",
    ]);
    expect(catalog.flat).toBe(true);
    const text = JSON.stringify(catalog);
    expect(text).not.toContain("amount");
    expect(text).not.toContain("waste");
    expect(text).not.toContain("minimumRate");
    expect(text).not.toContain("targetRate");
  });

  it("그룹 순서와 품목 순서를 지키고 비활성 그룹과 미지원 품목은 공개하지 않는다", () => {
    const catalog = buildPublicCatalog(library());
    expect(catalog.flat).toBe(false);
    expect(catalog.groups.map((group) => group.label)).toEqual(["인쇄·홍보물", "굿즈·아크릴"]);
    expect(catalog.groups[0]?.products.map((item) => item.legacyQuoteId)).toEqual(["banner", "pop"]);
    expect(catalog.groups[0]?.products[1]?.description).toBe("실내용");
    expect(listedLegacyIds(catalog)).not.toContain("dtf");
    expect(listedLegacyIds(catalog)).not.toContain("tshirt");
    expect(JSON.stringify(catalog)).not.toContain("새 키링");
    expect(JSON.stringify(catalog)).not.toContain("내부 원가");
    const created = library().recipes.find((row) => row.productId === "new-item");
    expect(customerQuoteBlockReason(created!)).toContain("원자재나 공정");
  });
});
