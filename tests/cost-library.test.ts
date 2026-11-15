import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcPop } from "@/lib/calc/pop";
import { calculateQuote } from "@/lib/calc/uvAcrylicKeyring";
import { getFileConfig } from "@/lib/config/fileConfig";
import { toPublicConfig } from "@/lib/config/publicConfig";
import { emptyCostLibrary, removeMaterial, removeProcess } from "@/lib/cost/library";
import { DEFAULT_TARGET_RATE, approveRecordedPrice, recommendSupply, simulatePricing } from "@/lib/cost/pricing";
import { scanDisplayedDrops } from "@/lib/cost/legacySale";
import type { CostLibrary, MaterialCost, ProcessDef, RecipeLine } from "@/lib/cost/types";
import { COST_LIBRARY_KEY } from "@/server/kvCostLibrary";

const asOf = "2026-11-15";

function material(patch: Partial<MaterialCost> = {}): MaterialCost {
  return {
    id: "film",
    label: "필름",
    kind: "원단",
    spec: "롤",
    active: true,
    purchaseUnit: "roll",
    usageUnit: "m",
    conversion: 50,
    conversionStatus: "confirmed",
    wasteRate: 0.05,
    wasteStatus: "confirmed",
    history: [],
    price: {
      amount: 100000,
      unit: "krw-per-m",
      tax: "exclusive",
      status: "confirmed",
      effectiveFrom: "2026-01-01",
    },
    ...patch,
  };
}

function libraryWith(
  materials: MaterialCost[],
  processes: ProcessDef[] = [],
  lines: RecipeLine[] = materials.map((row) => ({
    lineId: `line-${row.id}`,
    refId: row.id,
    kind: "material" as const,
    usage: "per-meter-layout" as const,
  }))
): CostLibrary {
  const library = emptyCostLibrary();
  const pop = library.recipes.find((row) => row.productId === "pop");
  if (pop) pop.lines = lines;
  library.materials = materials;
  library.processes = processes;
  library.margins = [
    {
      productId: "pop",
      minimumRate: 0.15,
      targetRate: 0.25,
      highRate: 0.4,
      effectiveFrom: "2026-01-01",
      revision: 1,
      history: [],
    },
  ];
  return library;
}

describe("원가 라이브러리", () => {
  it("목표 이익률 25%는 가산율 25%와 다른 13,330원이다", () => {
    const band = recommendSupply(10000, 0.25, 0.1);
    expect(band.supplyPrice).toBe(13330);
    expect(band.supplyPrice).not.toBe(12500);
    expect(band.profit).toBe(3330);
  });

  it("롤 환산과 로스 5%의 공급원가는 5,263원이다", () => {
    const config = getFileConfig();
    const result = simulatePricing(
      libraryWith([material()]),
      config,
      { productId: "pop", qty: 1, widthMm: 100, heightMm: 2500 },
      asOf
    );
    expect(result.lines[0]?.supplyCost).toBe(5263);
    expect(result.target?.supplyPrice).toBe(recommendSupply(5263, 0.25, 0.1).supplyPrice);
  });

  it("환산이나 로스가 비어 있으면 추천가를 만들지 않는다", () => {
    const config = getFileConfig();
    const missingWaste = material({ wasteRate: undefined, wasteStatus: "unconfirmed" });
    const result = simulatePricing(
      libraryWith([missingWaste]),
      config,
      { productId: "pop", qty: 1, widthMm: 100, heightMm: 2500 },
      asOf
    );
    expect(result.target?.supplyPrice).toBeUndefined();
    expect(result.missing.join(" ")).toContain("필름");
    expect(result.supplyCost).toBeUndefined();
  });

  it("같은 공정을 두 줄 넣으면 원가를 더한다", () => {
    const config = getFileConfig();
    const process: ProcessDef = {
      id: "cut",
      label: "재단",
      active: true,
      method: "per-ea",
      history: [],
      variable: {
        amount: 1000,
        unit: "krw-per-ea",
        tax: "exclusive",
        status: "confirmed",
        effectiveFrom: "2026-01-01",
      },
    };
    const library = emptyCostLibrary();
    const pop = library.recipes.find((row) => row.productId === "pop");
    if (!pop) throw new Error("pop");
    pop.lines = [
      { lineId: "a", refId: "cut", kind: "process", usage: "per-piece" },
      { lineId: "b", refId: "cut", kind: "process", usage: "per-piece" },
    ];
    library.processes = [process];
    library.margins = [
      { productId: "pop", targetRate: 0.25, effectiveFrom: "2026-01-01", revision: 1, history: [] },
    ];
    const result = simulatePricing(library, config, { productId: "pop", qty: 2, widthMm: 10, heightMm: 10 }, asOf);
    expect(result.supplyCost).toBe(4000);
  });

  it("사용 중인 원자재 삭제는 실패하고 비활성화는 된다", () => {
    const library = libraryWith([material()]);
    const removed = removeMaterial(library, "film");
    expect(removed.ok).toBe(false);
    const deactivated = {
      ...library,
      materials: library.materials.map((row) => ({ ...row, active: false })),
    };
    expect(deactivated.materials[0]?.active).toBe(false);
    expect(removeProcess(deactivated, "없는공정").ok).toBe(true);
  });

  it("원가 숫자를 넣어도 기존 POP 판매가는 그대로다", () => {
    const config = getFileConfig();
    const before = calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, config.settings).supply4Cut;
    simulatePricing(libraryWith([material({ price: { ...material().price, amount: config.settings.popSellPerM4 } })]), config, {
      productId: "pop",
      qty: 10,
      widthMm: 200,
      heightMm: 200,
    }, asOf);
    const after = calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, config.settings).supply4Cut;
    expect(before).toBe(126900);
    expect(after).toBe(before);
    expect(config.settings.popSellPerM4).toBe(63452);
  });

  it("현재 판매가가 목표 추천가보다 낮으면 경고만 한다", () => {
    const config = getFileConfig();
    const expensive = material({
      purchaseUnit: "ea",
      usageUnit: "ea",
      conversion: undefined,
      conversionStatus: "unconfirmed",
      wasteRate: 0,
      wasteStatus: "confirmed",
      price: { amount: 200000, unit: "krw-per-ea", tax: "exclusive", status: "confirmed", effectiveFrom: "2026-01-01" },
    });
    const library = libraryWith(
      [expensive],
      [],
      [{ lineId: "once", refId: "film", kind: "material", usage: "per-piece" }]
    );
    const result = simulatePricing(library, config, { productId: "pop", qty: 10, widthMm: 200, heightMm: 200 }, asOf);
    expect(result.belowTarget).toBe(true);
    expect(result.current?.supplyPrice).toBe(126900);
    expect(config.settings.popSellPerM4).toBe(63452);
    const approved = approveRecordedPrice(library, { confirm: false, productId: "pop", supplyPrice: result.target?.supplyPrice });
    expect(approved.ok).toBe(false);
    expect(library.recipes.find((row) => row.productId === "pop")?.approvedSupplyPrice).toBeUndefined();
  });

  it("DTF 1,350원은 코드 참고값이고 판매 13,900원과 다른 필드다", () => {
    const config = getFileConfig();
    const seed = emptyCostLibrary().equipment[0];
    expect(seed?.price.amount).toBe(1350);
    expect(seed?.price.status).toBe("code-reference");
    expect(config.settings.dtfCostPerM).toBe(1350);
    expect(config.settings.dtfSellPerM).toBe(13900);
    expect(seed?.price.amount).not.toBe(config.settings.dtfSellPerM);
  });

  it("공개 설정에는 매입가와 이익 필드가 없다", () => {
    const json = JSON.stringify(toPublicConfig(getFileConfig()));
    expect(json).not.toContain("purchasePrice");
    expect(json).not.toContain("wagePerMin");
    expect(json).not.toContain("wasteRate");
    expect(json).not.toContain("contribution");
  });

  it("원가 저장 모듈은 판매 설정 키를 쓰지 않는다", () => {
    const source = readFileSync("src/server/kvCostLibrary.ts", "utf8");
    const guard = readFileSync("src/server/kvJson.ts", "utf8");
    expect(COST_LIBRARY_KEY).toBe("quotation_cost_library");
    expect(source).not.toContain("writeKvConfig");
    expect(source).not.toContain("quotation_admin_config");
    expect(guard).toContain("forbidden");
  });

  it("UV 수량 스캔은 가격 하락을 알리지만 계산 결과는 그대로다", () => {
    const config = getFileConfig();
    const recipe = emptyCostLibrary().recipes.find((row) => row.legacyQuoteId === "uv-acrylic-keyring");
    if (!recipe) throw new Error("uv");
    const drops = scanDisplayedDrops(config, recipe);
    expect(drops.some((row) => row.qty === 2 && row.price === 4562 && row.previous === 7260)).toBe(true);
    expect(calculateQuote({ width: 45, height: 30, qty: 1 }).finalPrice).toBe(7260);
    expect(calculateQuote({ width: 45, height: 30, qty: 2 }).finalPrice).toBe(4562);
  });

  it("추천가는 총제작원가를 목표 이익률로 나누고 고정비가 있으면 공헌이익률이 아니다", () => {
    const config = getFileConfig();
    const library = emptyCostLibrary();
    const pop = library.recipes.find((row) => row.productId === "pop");
    if (!pop) throw new Error("pop");
    pop.lines = [{ lineId: "press", refId: "press", kind: "process", usage: "per-piece" }];
    library.processes = [
      {
        id: "press",
        label: "열프레스",
        active: true,
        method: "setup-plus-qty",
        history: [],
        setup: { amount: 1000, unit: "krw-per-order", tax: "exclusive", status: "confirmed", effectiveFrom: "2026-01-01" },
        variable: { amount: 1000, unit: "krw-per-ea", tax: "exclusive", status: "confirmed", effectiveFrom: "2026-01-01" },
      },
    ];
    const result = simulatePricing(library, config, { productId: "pop", qty: 1, widthMm: 100, heightMm: 100 }, asOf);
    expect(result.supplyCost).toBe(2000);
    expect(result.profitBasis).toBe("total-cost");
    expect(result.target?.supplyPrice).toBe(recommendSupply(2000, DEFAULT_TARGET_RATE, 0.1).supplyPrice);
    expect(result.target?.supplyPrice).not.toBe(recommendSupply(1000, DEFAULT_TARGET_RATE, 0.1).supplyPrice);
    expect(result.current?.supplyPrice).toBe(calcPop({ widthMm: 100, heightMm: 100, qty: 1 }, config.settings).supply4Cut);
  });

  it("원가가 비어 있으면 0원 추천가를 만들지 않는다", () => {
    const library = emptyCostLibrary();
    const result = simulatePricing(library, getFileConfig(), { productId: "없는품목", qty: 1 }, asOf);
    expect(result.target?.supplyPrice).toBeUndefined();
    expect(result.supplyCost).toBeUndefined();
  });
});
