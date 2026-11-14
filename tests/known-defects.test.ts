import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/calc/uvAcrylicKeyring";
import { calcTshirt } from "@/lib/calc/tshirt";
import { calcStickerSheet } from "@/lib/calc/stickerSheet";
import { calcStickerSolvent } from "@/lib/calc/stickerSolvent";
import { calcDtf } from "@/lib/calc/dtf";
import { calcBusinessCard } from "@/lib/calc/businessCard";
import { getFileConfig } from "@/lib/config/fileConfig";

/**
 * 현재 구현의 결함 기록이다.
 * 여기 있는 기대값은 올바른 판매 정책이 아니다.
 * 계산을 고치면 이 테스트가 실패해야 하며, 그때 정상 규칙으로 기대값을 교체한다.
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

  it("스티커 시트의 배치 불가 크기도 장당 1개로 최소 공급가를 낸다", () => {
    const result = calcStickerSheet(
      { materialKey: "Art", widthMm: 300, heightMm: 300, qty: 2, gapMm: 5 },
      s,
      file.stickerSheetSizes,
      file.stickerRates.Art
    );
    expect(result.a4.perSheet).toBe(1);
    expect(result.a4.supplyPrice).toBe(20000);
    expect(result.a3.perSheet).toBe(1);
    expect(result.a3.supplyPrice).toBe(20000);
    expect(result.a4.disabled).toBeUndefined();
  });

  it("솔벤트는 롤 폭을 넘는 규격도 에러 없이 금액을 낸다", () => {
    const result = calcStickerSolvent({ widthMm: 700, heightMm: 800, qty: 2, gapMm: 5 }, s);
    expect(result.lengthM).toBeCloseTo(1.41);
    expect(result.supplyPrice).toBe(104470);
  });

  it("DTF는 양쪽이 롤 폭을 넘으면 유한한 공급가 대신 Infinity를 반환한다", () => {
    const result = calcDtf({ widthMm: 900, heightMm: 900, qty: 1 }, s);
    expect(Number.isFinite(result.lengthM)).toBe(false);
    expect(Number.isFinite(result.supplyPrice)).toBe(false);
    expect(Number.isFinite(result.vatAndTotal.vat)).toBe(false);
    expect(Number.isFinite(result.costReference)).toBe(false);
  });

  it("명함 함수는 표에 없는 매수의 인쇄비를 0원으로 둔다", () => {
    const result = calcBusinessCard(
      { paperOptionId: "imported-same-day", designTierId: "basic", pcs: 300 },
      s,
      file.businessCardOptions,
      file.businessCardDesignTiers
    );
    expect(result.printPrice).toBe(0);
    expect(result.designFee).toBe(8000);
    expect(result.supplyPrice).toBe(8000);
  });
});
