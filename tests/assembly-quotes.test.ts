import { describe, expect, it } from "vitest";
import { getFileConfig } from "../src/lib/config/fileConfig";
import { calcPop } from "../src/lib/calc/pop";
import { calcTshirt } from "../src/lib/calc/tshirt";
import { duplicateRecipe, emptyCostLibrary } from "../src/lib/cost/library";
import { compareQuantities, simulatePricing } from "../src/lib/cost/pricing";
import type { CostAmount, CostLibrary, MaterialCost, ProcessDef, ProductRecipe, SimulationInput } from "../src/lib/cost/types";

const asOf = "2026-11-15";
const qtys = [1, 2, 9, 10, 11, 49, 50, 51, 99, 100, 101, 199, 200, 201, 299, 300, 301, 499, 500, 501, 999, 1000, 1001];

function money(amount: number, unit: CostAmount["unit"] = "krw-per-ea"): CostAmount {
  return { amount, unit, tax: "exclusive", status: "confirmed", effectiveFrom: "2026-01-01", note: "가상 원가" };
}

function material(partial: Partial<MaterialCost> & Pick<MaterialCost, "id" | "label">): MaterialCost {
  return {
    kind: "재료",
    spec: "가상 규격",
    active: true,
    purchaseUnit: "ea",
    usageUnit: "ea",
    conversionStatus: "unconfirmed",
    price: money(1000),
    wasteRate: 0,
    wasteStatus: "confirmed",
    history: [],
    ...partial,
  };
}

function process(partial: Partial<ProcessDef> & Pick<ProcessDef, "id" | "label">): ProcessDef {
  return {
    active: true,
    method: "per-ea",
    variable: money(500),
    history: [],
    ...partial,
  };
}

function recipe(productId: string, label: string, lines: ProductRecipe["lines"], reviewAboveQty?: number): ProductRecipe {
  return { productId, label, active: true, lines, showOnCustomerQuote: false, reviewAboveQty };
}

function shop(): CostLibrary {
  const base = emptyCostLibrary();
  return {
    ...base,
    materials: [
      material({
        id: "tee",
        label: "면 티셔츠",
        purchaseTiers: [
          { minQty: 1, maxQty: 49, unitPrice: 3000 },
          { minQty: 50, maxQty: 99, unitPrice: 2900 },
          { minQty: 100, maxQty: 499, unitPrice: 2700 },
          { minQty: 500, unitPrice: 2500 },
        ],
      }),
      material({ id: "bag", label: "에코백", price: money(2000) }),
      material({
        id: "film",
        label: "DTF 필름",
        spec: "폭 850mm, 길이 100m",
        purchaseUnit: "roll",
        usageUnit: "m",
        conversion: 100,
        conversionStatus: "confirmed",
        price: money(80000, "krw-per-m"),
        rollWidthMm: 850,
        wasteRate: 0.05,
        wasteStatus: "confirmed",
      }),
      material({ id: "paper", label: "아트지", purchaseUnit: "sheet", usageUnit: "sheet", price: money(500, "krw-per-sheet") }),
      material({ id: "solvent-media", label: "솔벤트 원단", purchaseUnit: "m", usageUnit: "m", rollWidthMm: 620, price: money(4000, "krw-per-m") }),
      material({ id: "pop-media", label: "POP 원단", purchaseUnit: "m", usageUnit: "m", rollWidthMm: 610, price: money(6000, "krw-per-m") }),
      material({ id: "acrylic", label: "아크릴", price: money(1500) }),
      material({ id: "card-paper", label: "명함용지", price: money(80) }),
      material({ id: "banner-media", label: "배너 원단", price: money(8000) }),
    ],
    processes: [
      process({ id: "dtf-print", label: "DTF 출력", method: "per-m", variable: money(800, "krw-per-m") }),
      process({ id: "solvent-print", label: "솔벤트 출력", method: "per-m", variable: money(700, "krw-per-m") }),
      process({ id: "uv-print", label: "UV 출력", method: "per-ea", variable: money(1200) }),
      process({ id: "heat", label: "열프레스", method: "setup-plus-qty", setup: money(3000, "krw-per-order"), variable: money(400) }),
      process({ id: "cut", label: "시트 커팅", method: "per-sheet", variable: money(300, "krw-per-sheet") }),
      process({ id: "pack", label: "포장", method: "per-ea", variable: money(200) }),
      process({ id: "design", label: "디자인 작업", method: "per-order", setup: money(8000, "krw-per-order") }),
    ],
    recipes: [
      recipe("dtf-shirt", "DTF 티셔츠", [
        { lineId: "a", refId: "tee", kind: "material", usage: "per-piece" },
        { lineId: "b", refId: "film", kind: "material", usage: "per-meter-layout" },
        { lineId: "c", refId: "dtf-print", kind: "process", usage: "per-meter-layout" },
        { lineId: "d", refId: "heat", kind: "process", usage: "per-piece" },
        { lineId: "e", refId: "pack", kind: "process", usage: "per-piece" },
      ]),
      recipe("eco-bag", "에코백", [
        { lineId: "a", refId: "bag", kind: "material", usage: "per-piece" },
        { lineId: "b", refId: "film", kind: "material", usage: "per-meter-layout" },
        { lineId: "c", refId: "dtf-print", kind: "process", usage: "per-meter-layout" },
        { lineId: "d", refId: "heat", kind: "process", usage: "per-piece" },
        { lineId: "e", refId: "pack", kind: "process", usage: "per-piece" },
      ]),
      recipe("sticker", "스티커 시트", [
        { lineId: "a", refId: "paper", kind: "material", usage: "per-sheet-imposition" },
        { lineId: "b", refId: "cut", kind: "process", usage: "per-sheet-imposition" },
      ]),
      recipe("solvent", "솔벤트 스티커", [
        { lineId: "a", refId: "solvent-media", kind: "material", usage: "per-meter-layout" },
        { lineId: "b", refId: "solvent-print", kind: "process", usage: "per-meter-layout" },
      ]),
      recipe("pop-item", "POP", [
        { lineId: "a", refId: "pop-media", kind: "material", usage: "per-meter-layout" },
      ]),
      recipe("uv-item", "UV아크릴키링", [
        { lineId: "a", refId: "acrylic", kind: "material", usage: "per-piece" },
        { lineId: "b", refId: "uv-print", kind: "process", usage: "per-piece" },
      ]),
      recipe("card", "명함", [
        { lineId: "a", refId: "card-paper", kind: "material", usage: "per-piece" },
        { lineId: "b", refId: "design", kind: "process", usage: "per-order" },
      ]),
      recipe("banner-item", "배너", [
        { lineId: "a", refId: "banner-media", kind: "material", usage: "per-piece" },
        { lineId: "b", refId: "pack", kind: "process", usage: "per-piece" },
      ]),
      recipe("film-only", "DTF 전사필름", [
        { lineId: "a", refId: "film", kind: "material", usage: "per-meter-layout" },
        { lineId: "b", refId: "dtf-print", kind: "process", usage: "per-meter-layout" },
      ]),
      recipe("goods", "복합 굿즈", [
        { lineId: "a", refId: "bag", kind: "material", usage: "per-piece" },
        { lineId: "b", refId: "acrylic", kind: "material", usage: "per-piece" },
        { lineId: "c", refId: "uv-print", kind: "process", usage: "per-piece" },
        { lineId: "d", refId: "heat", kind: "process", usage: "per-piece", times: 2 },
        { lineId: "e", refId: "pack", kind: "process", usage: "per-piece" },
        { lineId: "f", refId: "design", kind: "process", usage: "per-order" },
      ], 800),
    ],
    margins: ["dtf-shirt", "eco-bag", "sticker", "solvent", "pop-item", "uv-item", "card", "banner-item", "film-only", "goods"].map((productId) => ({
      productId,
      minimumRate: 0.15,
      targetRate: 0.25,
      highRate: 0.4,
      effectiveFrom: "2026-01-01",
      revision: 1,
      history: [],
    })),
  };
}

const sizes: Record<string, Pick<SimulationInput, "widthMm" | "heightMm">> = {
  "dtf-shirt": { widthMm: 100, heightMm: 100 },
  "eco-bag": { widthMm: 150, heightMm: 100 },
  sticker: { widthMm: 50, heightMm: 50 },
  solvent: { widthMm: 50, heightMm: 50 },
  "pop-item": { widthMm: 200, heightMm: 200 },
  "uv-item": { widthMm: 45, heightMm: 30 },
  card: { widthMm: 90, heightMm: 50 },
  "banner-item": { widthMm: 600, heightMm: 1800 },
  "film-only": { widthMm: 100, heightMm: 100 },
  goods: { widthMm: 80, heightMm: 80 },
};

describe("조립식 가상 견적", () => {
  it("10개 품목과 수량 경계 230건을 계산하고 역전은 경고로만 남긴다", () => {
    const library = shop();
    const config = getFileConfig();
    const beforePop = calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, config.settings).supply4Cut;
    const tee = config.tshirtTypes.find((row) => row.id === "short");
    const beforeShirt = tee ? calcTshirt({ typeId: "short", qty: 50, numberOf2XLPlus: 0 }, config.settings, tee, config.tshirtSizeUpPer2XL, config.tshirtDiscountTiers).supplyPrice : 0;
    let success = 0;
    let fail = 0;
    let warning = 0;
    for (const item of library.recipes) {
      const rows = compareQuantities(library, config, { productId: item.productId, qty: 1, gapMm: 7, ...sizes[item.productId] }, qtys, asOf);
      for (const row of rows) {
        const finitePrice = Number.isFinite(row.recommendedSupply) && Number.isFinite(row.supplyCost);
        if (!finitePrice || row.status === "missing") fail += 1;
        else if (row.status === "inversion" || row.status === "review") warning += 1;
        else success += 1;
      }
    }
    expect(beforePop).toBe(126900);
    expect(beforeShirt).toBe(720000);
    expect(success + fail + warning).toBe(10 * qtys.length);
    expect(success + fail + warning).toBeGreaterThanOrEqual(100);
    expect(fail).toBe(0);
    expect(warning).toBeGreaterThan(0);
    expect(library.materials.every((row) => row.price.note === "가상 원가")).toBe(true);
  });

  it("수량 구간 매입가는 그 수량의 단가만 쓰고 판매가는 바꾸지 않는다", () => {
    const library = shop();
    const config = getFileConfig();
    const low = simulatePricing(library, config, { productId: "dtf-shirt", qty: 49, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    const high = simulatePricing(library, config, { productId: "dtf-shirt", qty: 50, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    const teeLow = low.lines.find((line) => line.name === "면 티셔츠")?.supplyCost;
    const teeHigh = high.lines.find((line) => line.name === "면 티셔츠")?.supplyCost;
    expect(teeLow).toBe(49 * 3000);
    expect(teeHigh).toBe(50 * 2900);
    expect(config.settings.popSellPerM4).toBe(63452);
  });

  it("총액이 줄어드는 구간은 경고하고 기존 티셔츠 할인표는 그대로다", () => {
    const library = shop();
    const config = getFileConfig();
    const tee = config.tshirtTypes.find((row) => row.id === "short");
    const rows = compareQuantities(library, config, { productId: "dtf-shirt", qty: 1, widthMm: 100, heightMm: 100, gapMm: 7 }, [49, 50, 99, 100], asOf);
    expect(rows.find((row) => row.qty === 50)?.status).toBe("inversion");
    expect(rows.find((row) => row.qty === 100)?.status).toBe("inversion");
    const shirt49 = tee ? calcTshirt({ typeId: "short", qty: 49, numberOf2XLPlus: 0 }, config.settings, tee, config.tshirtSizeUpPer2XL, config.tshirtDiscountTiers).supplyPrice : 0;
    const shirt50 = tee ? calcTshirt({ typeId: "short", qty: 50, numberOf2XLPlus: 0 }, config.settings, tee, config.tshirtSizeUpPer2XL, config.tshirtDiscountTiers).supplyPrice : 0;
    expect(shirt49).toBe(793800);
    expect(shirt50).toBe(720000);
  });

  it("원가가 없으면 추천가를 만들지 않고 빠진 이름을 보여 준다", () => {
    const library = shop();
    const blank = library.materials.find((row) => row.id === "bag");
    if (blank) {
      blank.price = { ...blank.price, amount: undefined, status: "unconfirmed" };
      blank.purchaseTiers = undefined;
    }
    const result = simulatePricing(library, getFileConfig(), { productId: "eco-bag", qty: 10, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    expect(result.target?.supplyPrice).toBeUndefined();
    expect(result.missing.some((line) => line.includes("에코백"))).toBe(true);
    expect(result.approvalAllowed).toBe(false);
  });

  it("시트에 들어가지 않는 크기와 0 수량은 거절한다", () => {
    const library = shop();
    const config = getFileConfig();
    const over = simulatePricing(library, config, { productId: "sticker", qty: 10, widthMm: 500, heightMm: 500 }, asOf);
    const zero = simulatePricing(library, config, { productId: "sticker", qty: 0, widthMm: 50, heightMm: 50 }, asOf);
    expect(over.target?.supplyPrice).toBeUndefined();
    expect(over.missing.join(" ")).toContain("배치할 수 없습니다");
    expect(zero.missing.join(" ")).toContain("1 이상");
  });

  it("필름을 원자재로 붙이지 않으면 출력 공정이 필름비를 더하지 않는다", () => {
    const library = shop();
    const config = getFileConfig();
    const both = simulatePricing(library, config, { productId: "film-only", qty: 10, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    const printOnly = simulatePricing(
      { ...library, recipes: library.recipes.map((row) => row.productId === "film-only" ? { ...row, lines: row.lines.filter((line) => line.refId === "dtf-print") } : row) },
      config,
      { productId: "film-only", qty: 10, widthMm: 100, heightMm: 100, gapMm: 7 },
      asOf
    );
    expect(both.lines).toHaveLength(2);
    expect(both.supplyCost).toBeGreaterThan(0);
    expect(printOnly.supplyCost).toBeUndefined();
    expect(printOnly.missing.join(" ")).toContain("롤 폭");
    expect(printOnly.lines.map((line) => line.name)).toEqual(["DTF 출력"]);
  });

  it("대량 수량은 관리자 확인으로 표시한다", () => {
    const rows = compareQuantities(shop(), getFileConfig(), { productId: "goods", qty: 1, ...sizes.goods }, [500, 1000], asOf);
    expect(rows.find((row) => row.qty === 1000)?.status).toBe("review");
    expect(rows.find((row) => row.qty === 1000)?.note).toBe("관리자 확인 필요");
  });

  it("품목을 복제해도 원본과 고객 판매가는 유지된다", () => {
    const library = shop();
    const copied = duplicateRecipe(library, "dtf-shirt");
    expect(copied?.recipes.filter((row) => row.label.startsWith("DTF 티셔츠"))).toHaveLength(2);
    expect(library.recipes.find((row) => row.productId === "dtf-shirt")?.lines).toHaveLength(5);
    expect(copied?.recipes.find((row) => row.label === "DTF 티셔츠 복사")?.legacyQuoteId).toBeUndefined();
    expect(getFileConfig().settings.dtfSellPerM).toBe(13900);
  });

  it("원가를 바꾸면 새 견적만 달라지고 저장해 둔 숫자는 남는다", () => {
    const library = shop();
    const config = getFileConfig();
    const first = simulatePricing(library, config, { productId: "banner-item", qty: 10, widthMm: 600, heightMm: 1800 }, asOf);
    const snapshot = { supplyCost: first.supplyCost, presentedSupplyPrice: first.target?.supplyPrice };
    const changed = {
      ...library,
      materials: library.materials.map((row) => row.id === "banner-media" ? { ...row, price: { ...row.price, amount: 12000 } } : row),
    };
    const second = simulatePricing(changed, config, { productId: "banner-item", qty: 10, widthMm: 600, heightMm: 1800 }, asOf);
    expect(second.supplyCost).not.toBe(first.supplyCost);
    expect(snapshot.supplyCost).toBe(first.supplyCost);
    expect(snapshot.presentedSupplyPrice).toBe(first.target?.supplyPrice);
  });

  it("추천 공급가와 부가세는 10원 단위다", () => {
    const result = simulatePricing(shop(), getFileConfig(), { productId: "uv-item", qty: 3, widthMm: 45, heightMm: 30 }, asOf);
    expect(result.target?.supplyPrice! % 10).toBe(0);
    expect(result.target?.vat! % 10).toBe(0);
    expect(result.target?.total).toBe((result.target?.supplyPrice ?? 0) + (result.target?.vat ?? 0));
    expect(result.usesVirtualCost).toBe(true);
  });
});
