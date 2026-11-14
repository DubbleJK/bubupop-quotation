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
    expect(at(1)).toBe(7260);
    expect(at(2)).toBe(4562);
    expect(at(2)).toBeLessThan(at(1));
    expect(at(10)).toBe(22809);
    expect(at(11)).toBe(18062);
    expect(at(11)).toBeLessThan(at(10));
    expect(at(100)).toBe(154193);
    expect(at(101)).toBe(146752);
    expect(at(101)).toBeLessThan(at(100));
  });

  it("티셔츠 반팔은 9장과 10장 공급가가 같고, 50장이 49장보다 싸다", () => {
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
    expect(price(10)).toBe(162000);
    expect(price(49)).toBe(793800);
    expect(price(50)).toBe(720000);
    expect(price(50)).toBeLessThan(price(49));
  });
});
