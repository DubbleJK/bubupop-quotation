import { describe, expect, it } from "vitest";
import { calcDtf } from "@/lib/calc/dtf";
import { calcPop } from "@/lib/calc/pop";
import { calculateQuote } from "@/lib/calc/uvAcrylicKeyring";
import { getFileConfig } from "@/lib/config/fileConfig";
import { emptyCostLibrary } from "@/lib/cost/library";
import { recommendSupply, simulatePricing } from "@/lib/cost/pricing";
import type { CostLibrary, MaterialCost, ProcessDef } from "@/lib/cost/types";

const asOf = "2026-11-15";

function film(): MaterialCost {
  return {
    id: "dtf-film",
    label: "dtf필름",
    kind: "필름",
    spec: "시험용 폭 600mm",
    active: true,
    purchaseUnit: "roll",
    usageUnit: "m",
    conversion: 100,
    conversionStatus: "confirmed",
    rollWidthMm: 600,
    wasteRate: 0.15,
    wasteStatus: "confirmed",
    history: [],
    price: {
      amount: 1500000,
      unit: "krw-per-m",
      tax: "exclusive",
      status: "confirmed",
      effectiveFrom: "2026-01-01",
      note: "가상 원가",
    },
  };
}

function press(): ProcessDef {
  return {
    id: "heat",
    label: "열프레스",
    active: true,
    method: "per-ea",
    history: [],
    variable: {
      amount: 1500,
      unit: "krw-per-ea",
      tax: "exclusive",
      status: "confirmed",
      effectiveFrom: "2026-01-01",
      note: "가상 원가",
    },
  };
}

/** 폭 600mm, 간격 7mm, 200×200mm. 한 줄 2개. 로스는 배치 길이 이후에 한 번. */
function handFilm(qty: number): { lengthM: number; filmCost: number } {
  const rows = Math.ceil(qty / 2);
  const lengthM = (rows * 200 + Math.max(0, rows - 1) * 7) / 1000;
  const filmCost = Math.round((lengthM / 0.85) * 15000);
  return { lengthM, filmCost };
}

function dtfLibrary(label: string): CostLibrary {
  const library = emptyCostLibrary();
  library.recipes.push({
    productId: "sample",
    label,
    active: true,
    lines: [
      { lineId: "film", refId: "dtf-film", kind: "material", usage: "per-meter-layout" },
      { lineId: "heat", refId: "heat", kind: "process", usage: "per-piece" },
    ],
    showOnCustomerQuote: false,
  });
  library.materials = [film()];
  library.processes = [press()];
  return library;
}

describe("실전 수작업 대조", () => {
  it("개당 고정은 10개를 10m로 보고 가로·세로는 쓰지 않는다", () => {
    const library = dtfLibrary("에코백 DTF 인쇄");
    const recipe = library.recipes.find((row) => row.productId === "sample");
    if (!recipe) throw new Error("sample");
    recipe.lines = [{ lineId: "film", refId: "dtf-film", kind: "material", usage: "per-piece" }];
    const result = simulatePricing(library, getFileConfig(), { productId: "sample", qty: 10, widthMm: 200, heightMm: 200 }, asOf);
    expect(result.lines[0]?.usageQty).toBe(10);
    expect(result.lines[0]?.usageNote).toContain("가로·세로");
    expect(result.lines[0]?.supplyCost).toBe(Math.round((10 / 0.85) * 15000));
    expect(result.usesVirtualCost).toBe(true);
  });

  it("에코백과 티셔츠의 롤 배치는 수작업 길이와 같다", () => {
    const config = getFileConfig();
    for (const label of ["에코백 DTF 인쇄", "반팔 티셔츠 DTF 인쇄"]) {
      const library = dtfLibrary(label);
      for (const qty of [1, 10, 50, 100]) {
        const hand = handFilm(qty);
        const result = simulatePricing(library, config, { productId: "sample", qty, widthMm: 200, heightMm: 200, gapMm: 7 }, asOf);
        const filmLine = result.lines.find((line) => line.name === "dtf필름");
        const pressLine = result.lines.find((line) => line.name === "열프레스");
        expect(filmLine?.usageQty).toBeCloseTo(hand.lengthM, 6);
        expect(filmLine?.supplyCost).toBe(hand.filmCost);
        expect(pressLine?.supplyCost).toBe(qty * 1500);
        expect(result.supplyCost).toBe(hand.filmCost + qty * 1500);
        expect(result.minimum?.supplyPrice).toBe(recommendSupply(result.supplyCost ?? 0, 0.2, 0.1).supplyPrice);
        expect(result.target?.supplyPrice).toBe(recommendSupply(result.supplyCost ?? 0, 0.35, 0.1).supplyPrice);
        expect(result.usesVirtualCost).toBe(true);
        expect(result.warnings.join(" ")).not.toContain("두 번");
      }
    }
    const ten = handFilm(10);
    expect(ten.lengthM).toBeCloseTo(1.028, 6);
    expect(ten.filmCost).toBe(18141);
    expect(recommendSupply(18141 + 15000, 0.35, 0.1).supplyPrice).toBe(50990);
  });

  it("같은 이름이면 경고하고 고객 판매가는 비우지 않는다", () => {
    const library = dtfLibrary("열프레스");
    const result = simulatePricing(library, getFileConfig(), { productId: "sample", qty: 10, widthMm: 200, heightMm: 200, gapMm: 7 }, asOf);
    expect(result.warnings.join(" ")).toContain("품목 이름과 공정 이름");
    expect(result.current).toBeUndefined();
  });

  it("스티커, POP, UV는 등록 원가가 없으면 추천가를 만들지 않는다", () => {
    const config = getFileConfig();
    const library = emptyCostLibrary();
    const sticker = simulatePricing(library, config, { productId: "sticker-sheet", qty: 50, widthMm: 50, heightMm: 50, gapMm: 5 }, asOf);
    const pop = simulatePricing(library, config, { productId: "pop", qty: 10, widthMm: 200, heightMm: 200 }, asOf);
    const uv = simulatePricing(library, config, { productId: "uv-acrylic-keyring", qty: 1, widthMm: 45, heightMm: 30 }, asOf);
    expect(sticker.target?.supplyPrice).toBeUndefined();
    expect(pop.target?.supplyPrice).toBeUndefined();
    expect(uv.target?.supplyPrice).toBeUndefined();
    expect(pop.current?.supplyPrice).toBe(calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, config.settings).supply4Cut);
    expect(uv.current?.finalPrice).toBe(6000);
    expect(calcDtf({ widthMm: 100, heightMm: 100, qty: 10 }, config.settings).supplyPrice).toBe(2880);
    expect(calculateQuote({ width: 45, height: 30, qty: 1 }).finalPrice).toBe(6000);
  });

  it("롤 폭이나 간격이 없으면 길이를 지어내지 않는다", () => {
    const library = dtfLibrary("에코백 DTF 인쇄");
    const noGap = simulatePricing(library, getFileConfig(), { productId: "sample", qty: 10, widthMm: 200, heightMm: 200 }, asOf);
    expect(noGap.target?.supplyPrice).toBeUndefined();
    expect(noGap.missing.join(" ")).toContain("배치 간격");
    const noWidth = dtfLibrary("에코백 DTF 인쇄");
    const row = noWidth.materials[0];
    if (row) row.rollWidthMm = undefined;
    const blocked = simulatePricing(noWidth, getFileConfig(), { productId: "sample", qty: 10, widthMm: 200, heightMm: 200, gapMm: 7 }, asOf);
    expect(blocked.target?.supplyPrice).toBeUndefined();
    expect(blocked.missing.join(" ")).toContain("롤 폭");
  });
});
