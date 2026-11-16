import { describe, expect, it } from "vitest";
import { placeOnSheet } from "../src/lib/calc/sheet";
import { getFileConfig } from "../src/lib/config/fileConfig";
import { emptyCostLibrary } from "../src/lib/cost/library";
import { simulatePricing } from "../src/lib/cost/pricing";
import { usageUnitPrice } from "../src/lib/cost/rollPrice";
import type { CostAmount, CostLibrary, MaterialCost, ProcessDef, ProductRecipe } from "../src/lib/cost/types";

const asOf = "2026-11-16";
const config = getFileConfig();

function money(amount: number, unit: CostAmount["unit"], tax: CostAmount["tax"] = "exclusive"): CostAmount {
  return { amount, unit, tax, status: "confirmed", effectiveFrom: "2026-01-01" };
}

function material(partial: Partial<MaterialCost> & Pick<MaterialCost, "id" | "label" | "price">): MaterialCost {
  return {
    kind: "재료", spec: "", active: true, purchaseUnit: "ea", usageUnit: "ea", conversionStatus: "confirmed",
    wasteRate: 0, wasteStatus: "confirmed", history: [], ...partial,
  };
}

function process(partial: Partial<ProcessDef> & Pick<ProcessDef, "id" | "label" | "method">): ProcessDef {
  return { active: true, history: [], ...partial };
}

function library(recipe: ProductRecipe, materials: MaterialCost[], processes: ProcessDef[]): CostLibrary {
  return { ...emptyCostLibrary(), materials, processes, recipes: [recipe], margins: [{ productId: recipe.productId, minimumRate: 0.2, targetRate: 0.35, effectiveFrom: "2026-01-01", revision: 1, history: [] }] };
}

describe("롤 매입가와 직원 견적", () => {
  it("미터 가격은 롤 길이로 다시 나누지 않고 부가세와 폐기율을 한 번씩 적용한다", () => {
    const pvc = material({
      id: "pvc", label: "PVC 솔벤 무광", purchaseUnit: "roll", usageUnit: "m", conversion: 50, conversionStatus: "confirmed",
      rollWidthMm: 585, rollLengthM: 50, wasteRate: 0.1, price: money(1560, "krw-per-m", "inclusive"),
    });
    expect(usageUnitPrice(pvc, 0.1, asOf).amount).toBeCloseTo(1560 / 1.1, 6);
    const result = simulatePricing(library({
      productId: "pvc-item", label: "솔벤", active: true, showOnCustomerQuote: false,
      lines: [{ lineId: "film", refId: "pvc", kind: "material", usage: "per-meter-layout" }],
    }, [pvc], []), config, { productId: "pvc-item", qty: 1, widthMm: 585, heightMm: 1000, gapMm: 0 }, asOf);
    expect(result.lines[0]?.supplyCost).toBe(1576);
  });

  it("DTF 필름 15만 원은 롤 가격으로 보고 1m당 약 1,765원을 유지한다", () => {
    const film = material({
      id: "dtf", label: "DTF필름", purchaseUnit: "roll", usageUnit: "m", conversion: 100, conversionStatus: "confirmed",
      rollWidthMm: 850, rollLengthM: 100, wasteRate: 0.15, price: money(150000, "krw-per-m"),
    });
    const color = process({ id: "color", label: "DTF 컬러+화이트출력", method: "per-m2", variable: money(8000, "krw-per-m2") });
    const powder = process({ id: "powder", label: "DTF파우더", method: "per-m2", variable: money(640, "krw-per-m2") });
    const result = simulatePricing(library({
      productId: "dtf-item", label: "DTF출력", active: true, showOnCustomerQuote: false,
      lines: [
        { lineId: "film", refId: "dtf", kind: "material", usage: "per-meter-layout" },
        { lineId: "color", refId: "color", kind: "process", usage: "per-m2" },
        { lineId: "powder", refId: "powder", kind: "process", usage: "per-m2" },
      ],
    }, [film], [color, powder]), config, { productId: "dtf-item", qty: 1, widthMm: 850, heightMm: 1000, gapMm: 7 }, asOf);
    expect(result.lines.find((row) => row.lineId === "film")?.supplyCost).toBe(1765);
    expect(result.lines.find((row) => row.lineId === "color")?.supplyCost).toBe(6800);
    expect(result.lines.find((row) => row.lineId === "powder")?.supplyCost).toBe(544);
    expect(result.supplyCost).toBe(9109);
    expect(result.recommendedSupplyPrice).toBe(14020);
  });

  it("다른 롤 전체 가격은 길이로 한 번만 나눈다", () => {
    const coat = material({
      id: "coat", label: "코팅지", purchaseUnit: "roll", usageUnit: "m", conversion: 45, conversionStatus: "confirmed",
      rollWidthMm: 610, rollLengthM: 45, wasteRate: 0.15, price: money(61000, "krw-per-m"),
    });
    const result = simulatePricing(library({
      productId: "coat-item", label: "코팅", active: true, showOnCustomerQuote: false,
      lines: [{ lineId: "coat", refId: "coat", kind: "material", usage: "per-meter-layout" }],
    }, [coat], []), config, { productId: "coat-item", qty: 1, widthMm: 610, heightMm: 1000, gapMm: 0 }, asOf);
    expect(result.lines[0]?.supplyCost).toBe(Math.round((61000 / 45) / 0.85));
  });

  it("아트지와 유포지 스티커는 검증된 원가와 추천가를 유지한다", () => {
    const art = stickerLibrary("art", 90, 0.01, 200);
    const yup = stickerLibrary("yup", 118, 0.02, 400);
    const artResult = simulatePricing(art, config, { productId: "sticker", qty: 100, widthMm: 66, heightMm: 104, gapMm: 5 }, asOf);
    const yupResult = simulatePricing(yup, config, { productId: "sticker", qty: 100, widthMm: 66, heightMm: 104, gapMm: 5 }, asOf);
    expect(artResult.lines.find((row) => row.kind === "material")?.usageQty).toBe(25);
    expect(artResult.supplyCost).toBe(20773);
    expect(artResult.recommendedSupplyPrice).toBe(31960);
    expect(yupResult.supplyCost).toBe(26510);
    expect(yupResult.recommendedSupplyPrice).toBe(40790);
    const costs = [1, 10, 50, 100, 500].map((qty) => simulatePricing(art, config, { productId: "sticker", qty, widthMm: 66, heightMm: 104, gapMm: 5 }, asOf).supplyCost ?? 0);
    expect(costs[0]).toBeLessThan(costs[1] ?? 0);
    expect(costs[3]).toBe(20773);
    expect(new Set(costs).size).toBe(costs.length);
  });

  it("최소 판매금액은 추천가와 비교하고 원가에 더하지 않는다", () => {
    const paper = material({ id: "paper", label: "용지", purchaseUnit: "ea", usageUnit: "ea", price: money(11700, "krw-per-ea"), wasteRate: 0 });
    const base = library({
      productId: "goods", label: "상품", active: true, showOnCustomerQuote: false, minimumSupplyPrice: 25000,
      lines: [{ lineId: "paper", refId: "paper", kind: "material", usage: "per-piece" }],
    }, [paper], [process({ id: "labor", label: "작업", method: "per-ea", variable: money(0, "krw-per-ea") })]);
    const low = simulatePricing(base, config, { productId: "goods", qty: 1 }, asOf);
    expect(low.supplyCost).toBe(11700);
    expect(low.target?.supplyPrice).toBe(18000);
    expect(low.recommendedSupplyPrice).toBe(25000);
    const richPaper = material({ ...paper, price: money(26000, "krw-per-ea") });
    const high = simulatePricing({ ...base, materials: [richPaper] }, config, { productId: "goods", qty: 1 }, asOf);
    expect(high.target?.supplyPrice).toBe(40000);
    expect(high.recommendedSupplyPrice).toBe(40000);
  });
});

function stickerLibrary(id: string, sheetPrice: number, waste: number, cutPrice: number): CostLibrary {
  return library({
    productId: "sticker", label: id, active: true, showOnCustomerQuote: false,
    lines: [
      { lineId: "paper", refId: "paper", kind: "material", usage: "per-sheet-imposition" },
      { lineId: "cut", refId: "cut", kind: "process", usage: "per-sheet-imposition" },
      { lineId: "print", refId: "print", kind: "process", usage: "per-sheet-imposition" },
      { lineId: "setup", refId: "setup", kind: "process", usage: "per-order" },
    ],
  }, [
    material({ id: "paper", label: id, purchaseUnit: "sheet", usageUnit: "sheet", price: money(sheetPrice, "krw-per-sheet"), wasteRate: waste, sheetWidthMm: 205, sheetHeightMm: 292 }),
  ], [
    process({ id: "cut", label: "커팅", method: "per-sheet", variable: money(cutPrice, "krw-per-ea") }),
    process({ id: "print", label: "OKI", method: "per-sheet", variable: money(300, "krw-per-sheet") }),
    process({ id: "setup", label: "파일 확인·세팅·기본 검수", method: "per-order", setup: money(6000, "krw-per-order"), variable: { unit: "krw-per-ea", tax: "exclusive", status: "unconfirmed", effectiveFrom: "2026-01-01" } }),
  ]);
}

describe("판재 배치", () => {
  it("200×280은 205×292 판재에 사방 5mm를 빼면 들어가지 않는 이유를 말한다", () => {
    const placed = placeOnSheet({ sheetWidthMm: 205, sheetHeightMm: 292, trimMm: 5, gapMm: 1, itemWidthMm: 200, itemHeightMm: 280, qty: 1, allowRotate: true });
    expect(placed.ok).toBe(false);
    expect(placed.error).toContain("195×282");
    expect(placed.error).toContain("배치할 수 없습니다");
  });
});
