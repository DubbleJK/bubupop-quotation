import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/calc/uvAcrylicKeyring";
import { calcTshirt } from "@/lib/calc/tshirt";
import { getFileConfig } from "@/lib/config/fileConfig";

/**
 * 판매 정책 결정 전에는 바꾸지 않는 가격 역전 기록이다.
 * 스티커, 솔벤트, DTF, 명함의 계산 오류는 tests/calc-errors.test.ts에서 정상 규칙으로 검증한다.
 */
const file = getFileConfig();
const s = file.settings;

describe("결함 기록 (정상 규격이 아님)", () => {
  it("UV 45×30mm는 수량이 늘면 최종가가 줄어드는 구간이 있다", () => {
    const at = (qty: number) => calculateQuote({ width: 45, height: 30, qty }).finalPrice;
    expect(at(1)).toBe(6000);
    expect(at(2)).toBe(4562);
    expect(at(2)).toBeLessThan(at(1));
    expect(at(10)).toBe(22809);
    expect(at(11)).toBe(18062);
    expect(at(11)).toBeLessThan(at(10));
    expect(at(100)).toBe(154193);
    expect(at(101)).toBe(146752);
    expect(at(101)).toBeLessThan(at(100));
  });

  it("티셔츠 반팔은 수량이 늘면 공급가가 내려가지 않는다", () => {
    const type = file.tshirtTypes.find((item) => item.id === "short");
    const price = (qty: number) =>
      calcTshirt(
        { typeId: "short", qty, numberOf2XLPlus: 0 },
        s,
        type,
        file.tshirtSizeUpPer2XL,
        file.tshirtDiscountTiers
      ).supplyPrice;
    expect(price(9)).toBe(162000);
    expect(price(10)).toBe(178200);
    expect(price(49)).toBe(810000);
    expect(price(50)).toBe(824400);
    expect(price(99)).toBe(1530000);
    expect(price(100)).toBe(1543500);
    for (let qty = 2; qty <= 120; qty += 1) expect(price(qty)).toBeGreaterThan(price(qty - 1));
  });
});
