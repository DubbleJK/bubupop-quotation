import { describe, expect, it } from "vitest";
import { quoteCalculationForRole, quoteEntryForRole, type QuoteCalcBody } from "@/lib/cost/quoteView";

const full: QuoteCalcBody = {
  label: "아트지스티커",
  stage: "ready",
  stageLabel: "사용 가능",
  issues: ["아트지를 개당 고정 길이로 쓰고 있습니다. 실제 사용량이 확정되기 전에는 원가 구성이 미완성입니다."],
  fields: { width: true, height: true, gap: true },
  result: {
    missing: [],
    warnings: ["작업비가 원가에 없습니다."],
    supplyCost: 20773,
    targetRate: 0.35,
    targetSupplyPrice: 31960,
    productMinimumSupply: 25000,
    recommendedSupplyPrice: 31960,
    vatRate: 0.1,
    lines: [{ name: "아트지", supplyCost: 2275 }],
    costLibraryRevision: 41,
  },
};

describe("역할별 견적 응답", () => {
  it("직원 응답에는 원가, 원가 내역, 이익률이 없다", () => {
    const staff = quoteCalculationForRole(full, "staff");
    const json = JSON.stringify(staff);
    expect(json).not.toContain("supplyCost");
    expect(json).not.toContain("20773");
    expect(json).not.toContain("targetRate");
    expect(json).not.toContain("lines");
    expect(json).not.toContain("warnings");
    expect(json).not.toContain("원가");
    expect(staff.result.recommendedSupplyPrice).toBe(31960);
    expect(staff.result.productMinimumSupply).toBe(25000);
    expect(staff.result.vatRate).toBe(0.1);
    expect(staff.issues).toEqual([]);
  });

  it("최소 판매금액이 추천가일 때만 직원에게 그 사실을 알린다", () => {
    const staff = quoteCalculationForRole({
      ...full,
      result: { ...full.result, supplyCost: 6591, targetSupplyPrice: 10140, recommendedSupplyPrice: 25000 },
    }, "staff");
    expect(staff.result.minimumApplied).toBe(true);
    expect(JSON.stringify(staff)).not.toContain("6591");
    expect(JSON.stringify(staff)).not.toContain("10140");
  });

  it("관리자 응답은 원가 분석을 유지한다", () => {
    expect(quoteCalculationForRole(full, "admin").result.supplyCost).toBe(20773);
    expect(quoteCalculationForRole(full, "admin").result.lines).toHaveLength(1);
  });

  it("직원 견적 기록에는 당시 원가를 넣지 않는다", () => {
    const entry = {
      id: "quote-1",
      presentedSupplyPrice: 31960,
      presentedVat: 3200,
      presentedTotal: 35160,
      internal: { supplyCost: 20773, lines: [{ name: "아트지" }] },
    };
    expect(quoteEntryForRole(entry, "staff").internal).toBeUndefined();
    expect(quoteEntryForRole(entry, "staff").presentedVat).toBe(3200);
    expect(quoteEntryForRole(entry, "admin").internal?.supplyCost).toBe(20773);
  });
});
