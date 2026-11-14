import { describe, expect, it } from "vitest";
import { calcVatAndTotal, roundToNearest10 } from "@/lib/calc/common";

describe("현재 10원 반올림과 부가세", () => {
  it("공급가를 10원 단위로 반올림한다", () => {
    expect(roundToNearest10(31726)).toBe(31730);
    expect(roundToNearest10(126904)).toBe(126900);
    expect(roundToNearest10(49898.6)).toBe(49900);
  });

  it("부가세와 총액을 각각 10원 단위로 반올림한다", () => {
    expect(calcVatAndTotal(20000, 0.1)).toEqual({ vat: 2000, total: 22000 });
    expect(calcVatAndTotal(2880, 0.1)).toEqual({ vat: 290, total: 3170 });
    expect(calcVatAndTotal(1110, 0.1)).toEqual({ vat: 110, total: 1220 });
    expect(calcVatAndTotal(167400, 0.1)).toEqual({ vat: 16740, total: 184140 });
  });

  it("줄마다 반올림한 부가세의 합과 합산 후 한 번의 부가세는 다를 수 있다", () => {
    const separate = calcVatAndTotal(1040, 0.1).vat + calcVatAndTotal(1040, 0.1).vat;
    const combined = calcVatAndTotal(2080, 0.1).vat;
    expect(separate).toBe(200);
    expect(combined).toBe(210);
  });
});
