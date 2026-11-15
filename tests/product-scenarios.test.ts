import { describe, expect, it } from "vitest";
import { calcPop } from "../src/lib/calc/pop";
import { getFileConfig } from "../src/lib/config/fileConfig";
import { emptyCostLibrary, withLibraryRevision } from "../src/lib/cost/library";
import { simulatePricing } from "../src/lib/cost/pricing";
import type { CostAmount, CostLibrary, MaterialCost, ProcessDef, ProductRecipe } from "../src/lib/cost/types";

const asOf = "2026-11-16";

function money(amount: number, unit: CostAmount["unit"], status: CostAmount["status"] = "confirmed"): CostAmount {
  return { amount, unit, tax: "exclusive", status, effectiveFrom: "2026-01-01", note: "가상 검증" };
}

function material(partial: Partial<MaterialCost> & Pick<MaterialCost, "id" | "label" | "price">): MaterialCost {
  return {
    kind: "재료",
    spec: "",
    active: true,
    purchaseUnit: "ea",
    usageUnit: "ea",
    conversionStatus: "confirmed",
    wasteRate: 0,
    wasteStatus: "confirmed",
    history: [],
    ...partial,
  };
}

function process(partial: Partial<ProcessDef> & Pick<ProcessDef, "id" | "label" | "method">): ProcessDef {
  return { active: true, history: [], ...partial };
}

function line(lineId: string, refId: string, kind: "material" | "process", usage: ProductRecipe["lines"][number]["usage"], extra: Partial<ProductRecipe["lines"][number]> = {}) {
  return { lineId, refId, kind, usage, ...extra };
}

describe("판매 품목 시나리오", () => {
  it("A4 스티커는 한 장에 15개, 50개에 4장으로 계산한다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      materials: [
        material({
          id: "art",
          label: "아트지",
          purchaseUnit: "sheet",
          usageUnit: "sheet",
          price: money(500, "krw-per-sheet"),
          sheetWidthMm: 210,
          sheetHeightMm: 297,
        }),
      ],
      processes: [
        process({ id: "print", label: "시트 출력", method: "per-sheet", variable: money(200, "krw-per-sheet") }),
        process({ id: "cut", label: "시트 커팅", method: "per-sheet", variable: money(300, "krw-per-sheet") }),
      ],
      recipes: [
        {
          productId: "a4-sticker",
          label: "A4 스티커",
          active: true,
          showOnCustomerQuote: false,
          lines: [
            line("paper", "art", "material", "per-sheet-imposition"),
            line("print", "print", "process", "per-sheet-imposition"),
            line("cut", "cut", "process", "per-sheet-imposition"),
          ],
        },
      ],
      margins: [],
    };
    const result = simulatePricing(
      library,
      getFileConfig(),
      { productId: "a4-sticker", qty: 50, widthMm: 50, heightMm: 50, gapMm: 5 },
      asOf
    );
    expect(result.lines.every((row) => row.usageQty === 4)).toBe(true);
    expect(result.lines[0]?.usageNote).toContain("한 장에 15개");
    expect(result.lines[0]?.usageNote).not.toContain("네스팅 결과");
    expect(result.supplyCost).toBe(500 * 4 + 200 * 4 + 300 * 4);
    expect(result.target?.supplyPrice).toBe(6160);
    expect(result.missing).toEqual([]);
  });

  it("아크릴 키링은 판재 1장과 개당 공정을 따로 계산하고 고르지 않은 포장은 빼 둔다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      groups: [{ id: "goods", label: "굿즈·아크릴", sortOrder: 0, active: true }],
      materials: [
        material({
          id: "board",
          label: "아크릴 판재",
          purchaseUnit: "sheet",
          usageUnit: "sheet",
          price: money(10000, "krw-per-sheet"),
          sheetWidthMm: 1000,
          sheetHeightMm: 500,
        }),
        material({ id: "ink", label: "UV 잉크", usageUnit: "m2", purchaseUnit: "m2", price: money(20000, "krw-per-m2") }),
        material({ id: "ring", label: "키링 고리", price: money(300, "krw-per-ea") }),
        material({ id: "bag", label: "포장 봉투", price: money(80, "krw-per-ea") }),
      ],
      processes: [
        process({ id: "laser", label: "레이저 가공", method: "per-ea", variable: money(200, "krw-per-ea") }),
        process({ id: "uv", label: "UV 출력", method: "per-ea", variable: money(500, "krw-per-ea") }),
        process({ id: "pack", label: "포장", method: "per-ea", variable: money(100, "krw-per-ea") }),
        process({ id: "design", label: "디자인 작업", method: "per-order", setup: money(8000, "krw-per-order") }),
      ],
      recipes: [
        {
          productId: "keyring",
          label: "UV 아크릴 키링",
          active: true,
          showOnCustomerQuote: false,
          groupId: "goods",
          options: [
            { id: "opp", label: "개별 OPP 포장" },
            { id: "design", label: "추가 디자인" },
            { id: "double", label: "양면 인쇄" },
          ],
          lines: [
            line("board", "board", "material", "per-sheet-imposition"),
            line("ink", "ink", "material", "per-m2"),
            line("ring", "ring", "material", "per-piece"),
            line("laser", "laser", "process", "per-piece"),
            line("uv", "uv", "process", "per-piece"),
            line("uv2", "uv", "process", "per-piece", { optionId: "double" }),
            line("bag", "bag", "material", "per-piece", { optionId: "opp" }),
            line("pack", "pack", "process", "per-piece", { optionId: "opp" }),
            line("design", "design", "process", "per-order", { optionId: "design" }),
          ],
        },
      ],
      margins: [],
    };
    const input = { productId: "keyring", qty: 100, widthMm: 50, heightMm: 30, gapMm: 5 };
    const plain = simulatePricing(library, getFileConfig(), input, asOf);
    expect(plain.lines.find((row) => row.lineId === "board")?.usageQty).toBe(1);
    expect(plain.lines.find((row) => row.lineId === "board")?.supplyCost).toBe(10000);
    expect(plain.lines.find((row) => row.lineId === "ink")?.supplyCost).toBe(3000);
    expect(plain.lines.find((row) => row.lineId === "ring")?.supplyCost).toBe(30000);
    expect(plain.lines.find((row) => row.lineId === "laser")?.supplyCost).toBe(20000);
    expect(plain.lines.find((row) => row.lineId === "uv")?.supplyCost).toBe(50000);
    expect(plain.lines.some((row) => row.lineId === "pack" || row.lineId === "design" || row.lineId === "uv2")).toBe(false);
    expect(plain.supplyCost).toBe(113000);
    expect(plain.target?.supplyPrice).toBe(173850);
    expect(plain.warnings.some((warning) => warning.includes("잉크"))).toBe(true);

    const packed = simulatePricing(library, getFileConfig(), { ...input, optionIds: ["opp", "double"] }, asOf);
    expect(packed.lines.find((row) => row.lineId === "uv2")?.supplyCost).toBe(50000);
    expect(packed.lines.find((row) => row.lineId === "bag")?.supplyCost).toBe(8000);
    expect(packed.lines.find((row) => row.lineId === "pack")?.supplyCost).toBe(10000);
    expect(packed.lines.some((row) => row.lineId === "design")).toBe(false);
    expect(packed.supplyCost).toBe(113000 + 50000 + 8000 + 10000);
  });

  it("측정하지 않은 잉크는 확정 원가처럼 0원으로 계산하지 않는다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      materials: [
        material({
          id: "ink",
          label: "UV 잉크",
          usageUnit: "m2",
          purchaseUnit: "m2",
          price: { amount: undefined, unit: "krw-per-m2", tax: "exclusive", status: "unconfirmed", effectiveFrom: "2026-01-01", note: "추정 미입력" },
        }),
      ],
      processes: [],
      recipes: [
        {
          productId: "ink-only",
          label: "잉크 확인",
          active: true,
          showOnCustomerQuote: false,
          lines: [line("ink", "ink", "material", "per-m2")],
        },
      ],
      margins: [],
    };
    const result = simulatePricing(library, getFileConfig(), { productId: "ink-only", qty: 10, widthMm: 50, heightMm: 30 }, asOf);
    expect(result.supplyCost).toBeUndefined();
    expect(result.target).toBeUndefined();
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.lines[0]?.supplyCost).toBeUndefined();
  });

  it("DTF 티셔츠 1개와 100개는 롤 길이와 세팅비를 따로 반영한다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      materials: [
        material({ id: "shirt", label: "티셔츠", price: money(4000, "krw-per-ea") }),
        material({
          id: "film",
          label: "DTF 필름",
          purchaseUnit: "roll",
          usageUnit: "m",
          conversion: 100,
          price: money(1500000, "krw-per-m"),
          rollWidthMm: 600,
          wasteRate: 0.15,
        }),
      ],
      processes: [
        process({ id: "print", label: "DTF 출력", method: "per-m", variable: money(800, "krw-per-m") }),
        process({
          id: "press",
          label: "열프레스",
          method: "setup-plus-qty",
          setup: money(3000, "krw-per-order"),
          variable: money(150, "krw-per-ea"),
        }),
      ],
      recipes: [
        {
          productId: "dtf-shirt",
          label: "DTF 티셔츠",
          active: true,
          showOnCustomerQuote: false,
          lines: [
            line("shirt", "shirt", "material", "per-piece"),
            line("film", "film", "material", "per-meter-layout"),
            line("print", "print", "process", "per-meter-layout"),
            line("press", "press", "process", "per-piece"),
          ],
        },
      ],
      margins: [],
    };
    const one = simulatePricing(library, getFileConfig(), { productId: "dtf-shirt", qty: 1, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    const hundred = simulatePricing(library, getFileConfig(), { productId: "dtf-shirt", qty: 100, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    expect(one.lines.find((row) => row.lineId === "film")?.usageQty).toBeCloseTo(0.1, 5);
    expect(one.lines.find((row) => row.lineId === "film")?.supplyCost).toBe(1765);
    expect(one.supplyCost).toBe(8995);
    expect(hundred.lines.find((row) => row.lineId === "film")?.usageQty).toBeCloseTo(2.133, 5);
    expect(hundred.lines.find((row) => row.lineId === "film")?.supplyCost).toBe(37641);
    expect(hundred.supplyCost).toBe(457347);
    expect((hundred.supplyCost ?? 0) / 100).toBeLessThan(one.supplyCost ?? 0);
    expect(hundred.target?.supplyPrice).toBeGreaterThan(one.target?.supplyPrice ?? 0);
  });

  it("특수 형태는 수동 배치로 표시하고 그룹과 품목 ID는 저장 후에도 유지한다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      groups: [{ id: "etc", label: "기타", sortOrder: 1, active: true }],
      materials: [material({ id: "board", label: "아크릴 판재", purchaseUnit: "sheet", usageUnit: "sheet", price: money(8000, "krw-per-sheet") })],
      processes: [],
      recipes: [
        {
          productId: "odd-shape",
          label: "특수 아크릴",
          active: true,
          showOnCustomerQuote: false,
          groupId: "etc",
          lines: [line("board", "board", "material", "per-sheet-imposition", { manualPerSheet: 7 })],
        },
      ],
      margins: [],
    };
    const result = simulatePricing(library, getFileConfig(), { productId: "odd-shape", qty: 20, widthMm: 80, heightMm: 40 }, asOf);
    expect(result.lines[0]?.usageQty).toBe(3);
    expect(result.lines[0]?.usageNote).toContain("수동 배치");
    expect(result.lines[0]?.usageNote).toContain("네스팅 결과가 아닙니다");
    const saved = withLibraryRevision(null, library, new Date("2026-11-16T00:00:00Z"));
    expect(saved.groups?.[0]?.id).toBe("etc");
    expect(saved.recipes[0]?.productId).toBe("odd-shape");
    expect(saved.recipes[0]?.lines[0]?.refId).toBe("board");
  });

  it("A4 스티커 재료비 4,000원에 최소 작업비를 올리되 준비비와 더하지 않는다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      materials: [
        material({
          id: "art",
          label: "아트지",
          purchaseUnit: "sheet",
          usageUnit: "sheet",
          price: money(1000, "krw-per-sheet"),
          sheetWidthMm: 210,
          sheetHeightMm: 297,
        }),
      ],
      processes: [
        process({ id: "cut", label: "시트 커팅", method: "per-sheet", variable: money(100, "krw-per-sheet"), minCharge: 2500 }),
      ],
      recipes: [
        {
          productId: "a4",
          label: "A4 스티커",
          active: true,
          showOnCustomerQuote: false,
          lines: [
            line("paper", "art", "material", "per-sheet-imposition"),
            line("cut", "cut", "process", "per-sheet-imposition"),
          ],
        },
      ],
      margins: [],
    };
    const result = simulatePricing(library, getFileConfig(), { productId: "a4", qty: 50, widthMm: 50, heightMm: 50, gapMm: 5 }, asOf);
    expect(result.lines.find((row) => row.lineId === "paper")?.supplyCost).toBe(4000);
    expect(result.lines.find((row) => row.lineId === "cut")?.supplyCost).toBe(2500);
    expect(result.lines.find((row) => row.lineId === "cut")?.usageNote).toContain("최소 작업비");
    expect(result.supplyCost).toBe(6500);
    expect(result.target?.supplyPrice).toBe(10000);
    expect(result.laborUnpriced).toBe(false);
  });

  it("아크릴 1개와 100개는 사용량 비례일 때 판재비가 달라지고 공정비는 장수 기준이다", () => {
    const board = material({
      id: "board",
      label: "아크릴 판재",
      purchaseUnit: "sheet",
      usageUnit: "sheet",
      price: money(10000, "krw-per-sheet"),
      sheetWidthMm: 1000,
      sheetHeightMm: 500,
      sheetCharge: "share",
    });
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      materials: [board],
      processes: [process({ id: "laser", label: "레이저 가공", method: "per-sheet", variable: money(500, "krw-per-sheet") })],
      recipes: [
        {
          productId: "keyring",
          label: "UV 아크릴 키링",
          active: true,
          showOnCustomerQuote: false,
          lines: [
            line("board", "board", "material", "per-sheet-imposition"),
            line("laser", "laser", "process", "per-sheet-imposition"),
          ],
        },
      ],
      margins: [],
    };
    const input = { productId: "keyring", widthMm: 50, heightMm: 30, gapMm: 5 };
    const one = simulatePricing(library, getFileConfig(), { ...input, qty: 1 }, asOf);
    const hundred = simulatePricing(library, getFileConfig(), { ...input, qty: 100 }, asOf);
    expect(one.lines.find((row) => row.lineId === "board")?.usageNote).toContain("사용량 비례");
    expect(one.lines.find((row) => row.lineId === "board")?.supplyCost).toBe(40);
    expect(hundred.lines.find((row) => row.lineId === "board")?.supplyCost).toBe(3968);
    expect(one.lines.find((row) => row.lineId === "laser")?.supplyCost).toBe(500);
    expect(hundred.lines.find((row) => row.lineId === "laser")?.supplyCost).toBe(500);
    const full: CostLibrary = { ...library, materials: [{ ...board, sheetCharge: "full" }] };
    const oneFull = simulatePricing(full, getFileConfig(), { ...input, qty: 1 }, asOf);
    expect(oneFull.lines.find((row) => row.lineId === "board")?.supplyCost).toBe(10000);
    expect(oneFull.lines.find((row) => row.lineId === "board")?.usageNote).toContain("판재 전체 사용");
  });

  it("같은 장비 준비비는 한 주문에 한 번만 넣고 작업비가 없으면 추천가를 믿지 않는다", () => {
    const library: CostLibrary = {
      ...emptyCostLibrary(),
      equipment: [
        {
          id: "dtf-machine",
          label: "DTF 장비",
          history: [],
          price: money(0, "krw-per-order"),
          setup: money(3000, "krw-per-order"),
        },
      ],
      materials: [
        material({ id: "shirt", label: "티셔츠", price: money(4000, "krw-per-ea") }),
        material({
          id: "film",
          label: "DTF 필름",
          purchaseUnit: "roll",
          usageUnit: "m",
          conversion: 100,
          price: money(1500000, "krw-per-m"),
          rollWidthMm: 600,
          wasteRate: 0.15,
        }),
      ],
      processes: [
        process({ id: "print", label: "DTF 출력", method: "per-m", variable: money(800, "krw-per-m"), equipmentId: "dtf-machine" }),
        process({
          id: "press",
          label: "열프레스",
          method: "per-ea",
          variable: money(150, "krw-per-ea"),
          equipmentId: "dtf-machine",
          setup: money(3000, "krw-per-order"),
        }),
      ],
      recipes: [
        {
          productId: "dtf-shirt",
          label: "DTF 티셔츠",
          active: true,
          showOnCustomerQuote: false,
          lines: [
            line("shirt", "shirt", "material", "per-piece"),
            line("film", "film", "material", "per-meter-layout"),
            line("print", "print", "process", "per-meter-layout"),
            line("press", "press", "process", "per-piece"),
          ],
        },
      ],
      margins: [],
    };
    const one = simulatePricing(library, getFileConfig(), { productId: "dtf-shirt", qty: 1, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    const hundred = simulatePricing(library, getFileConfig(), { productId: "dtf-shirt", qty: 100, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    expect(one.lines.find((row) => row.lineId === "print")?.supplyCost).toBe(3080);
    expect(one.lines.find((row) => row.lineId === "press")?.supplyCost).toBe(150);
    expect(one.lines.find((row) => row.lineId === "press")?.usageNote).toContain("빼 두었습니다");
    expect(one.supplyCost).toBe(8995);
    expect(hundred.lines.find((row) => row.lineId === "print")?.supplyCost).toBe(4706);
    expect(hundred.lines.find((row) => row.lineId === "press")?.supplyCost).toBe(15000);
    expect(hundred.supplyCost).toBe(457347);
    const bare: CostLibrary = {
      ...library,
      processes: [],
      recipes: [{ ...library.recipes[0]!, lines: library.recipes[0]!.lines.filter((row) => row.kind === "material") }],
    };
    const materialOnly = simulatePricing(bare, getFileConfig(), { productId: "dtf-shirt", qty: 1, widthMm: 100, heightMm: 100, gapMm: 7 }, asOf);
    expect(materialOnly.laborUnpriced).toBe(true);
    expect(materialOnly.approvalAllowed).toBe(false);
    expect(materialOnly.warnings.join(" ")).toContain("그대로 믿지");
    expect(materialOnly.target?.supplyPrice).toBeGreaterThan(0);
  });

  it("고객 POP 판매가는 새 원가 계산과 무관하게 유지된다", () => {
    const config = getFileConfig();
    expect(calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, config.settings).supply4Cut).toBe(126900);
  });
});
