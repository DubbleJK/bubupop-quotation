import { describe, expect, it } from "vitest";
import { calcPop } from "@/lib/calc/pop";
import { calcStickerSheet } from "@/lib/calc/stickerSheet";
import { calcStickerSolvent } from "@/lib/calc/stickerSolvent";
import { calculateQuote, UV_ACRYLIC_KEYRING_TEST_CASES } from "@/lib/calc/uvAcrylicKeyring";
import { calcDtf } from "@/lib/calc/dtf";
import { calcVatAndTotal } from "@/lib/calc/common";
import { calcTshirt } from "@/lib/calc/tshirt";
import { calcBusinessCard } from "@/lib/calc/businessCard";
import { calcBanner } from "@/lib/calc/banner";
import { getFileConfig } from "@/lib/config/fileConfig";

const file = getFileConfig();
const s = file.settings;

describe("기존 정상 입력의 판매가 (코드 기본값)", () => {
  it("POP-200 200×200mm 10장", () => {
    const result = calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, s);
    expect(result.error).toBeUndefined();
    expect(result.lengthM).toBe(2);
    expect(result.supply4Cut).toBe(126900);
    expect(result.vatAndTotal4).toEqual({ vat: 12690, total: 139590 });
    expect(result.supply2Cut).toBe(110090);
  });

  it("POP-50 50×50mm 10장", () => {
    const result = calcPop({ widthMm: 50, heightMm: 50, qty: 10 }, s);
    expect(result.lengthM).toBe(0.5);
    expect(result.supply4Cut).toBe(31730);
    expect(result.vatAndTotal4.vat).toBe(3170);
    expect(result.vatAndTotal4.total).toBe(34900);
  });

  it("POP-OVER 양쪽이 롤 폭을 넘으면 금액 없이 거절", () => {
    const result = calcPop({ widthMm: 700, heightMm: 800, qty: 1 }, s);
    expect(result.error).toBe("폭 초과(610mm) - 사이즈 확인");
    expect(result.supply4Cut).toBe(0);
    expect(result.supply2Cut).toBe(0);
  });

  it("STK-MIN 아트지 50×50mm 50매 간격 5mm는 최소 공급가", () => {
    const result = calcStickerSheet(
      { materialKey: "Art", widthMm: 50, heightMm: 50, qty: 50, gapMm: 5 },
      s,
      file.stickerSheetSizes,
      file.stickerRates.Art
    );
    expect(result.a4.perSheet).toBe(15);
    expect(result.a4.sheets).toBe(4);
    expect(result.a4.supplyPrice).toBe(20000);
    expect(result.a4.vatAndTotal).toEqual({ vat: 2000, total: 22000 });
    expect(result.a3.supplyPrice).toBe(20000);
  });

  it("STK-A3OFF 투명데드롱 A3는 계산하지 않음", () => {
    const result = calcStickerSheet(
      { materialKey: "TransparentDeadlong", widthMm: 50, heightMm: 50, qty: 50, gapMm: 5 },
      s,
      file.stickerSheetSizes,
      file.stickerRates.TransparentDeadlong
    );
    expect(result.a3.disabled).toBe(true);
    expect(result.a3.supplyPrice).toBe(0);
    expect(result.a4.supplyPrice).toBe(20000);
  });

  it("SOL-50 50×50mm 100장 간격 5mm", () => {
    const result = calcStickerSolvent({ widthMm: 50, heightMm: 50, qty: 100, gapMm: 5 }, s);
    expect(result.lengthM).toBeCloseTo(0.55);
    expect(result.supplyPrice).toBe(49900);
    expect(result.vatAndTotal).toEqual({ vat: 4990, total: 54890 });
  });

  it("UV-REF 모듈에 적힌 검증 최종가", () => {
    for (const sample of UV_ACRYLIC_KEYRING_TEST_CASES) {
      const quote = calculateQuote({ width: sample.width, height: sample.height, qty: sample.qty });
      expect(quote.finalPrice).toBe(sample.expectedFinalPrice);
    }
  });

  it("DTF-100 100×100mm 10장", () => {
    const result = calcDtf({ widthMm: 100, heightMm: 100, qty: 10 }, s);
    expect(result.lengthM).toBeCloseTo(0.207);
    expect(result.supplyPrice).toBe(2880);
    expect(result.vatAndTotal).toEqual({ vat: 290, total: 3170 });
    expect(result.costReference).toBe(280);
    expect(result.rotated).toBe(false);
  });

  it("DTF-SUM 줄 공급가를 합친 뒤 부가세를 한 번 계산", () => {
    const a = calcDtf({ widthMm: 100, heightMm: 80, qty: 3 }, s);
    const b = calcDtf({ widthMm: 200, heightMm: 150, qty: 2 }, s);
    expect(a.supplyPrice).toBe(1110);
    expect(b.supplyPrice).toBe(2090);
    expect(calcVatAndTotal(a.supplyPrice + b.supplyPrice, s.vatRate)).toEqual({ vat: 320, total: 3520 });
  });

  it("TSH-XL 반팔 10장 중 2XL 2장", () => {
    const type = file.tshirtTypes.find((item) => item.id === "short");
    const result = calcTshirt(
      { typeId: "short", qty: 10, numberOf2XLPlus: 2 },
      s,
      type,
      file.tshirtSizeUpPer2XL,
      file.tshirtDiscountTiers
    );
    expect(result.discountRate).toBe(0.1);
    expect(result.supplyPrice).toBe(167400);
    expect(result.vatAndTotal.vat).toBe(16740);
    expect(result.vatAndTotal.total).toBe(184140);
  });

  it("TSH-100 후드 100장 중 2XL 10장", () => {
    const type = file.tshirtTypes.find((item) => item.id === "hoodie");
    const result = calcTshirt(
      { typeId: "hoodie", qty: 100, numberOf2XLPlus: 10 },
      s,
      type,
      file.tshirtSizeUpPer2XL,
      file.tshirtDiscountTiers
    );
    expect(result.discountRate).toBe(0.25);
    expect(result.supplyPrice).toBe(1897500);
    expect(result.vatAndTotal.vat).toBe(189750);
    expect(result.vatAndTotal.total).toBe(2087250);
  });

  it("CARD-100 수입 당일제 100매 베이직", () => {
    const result = calcBusinessCard(
      { paperOptionId: "imported-same-day", designTierId: "basic", pcs: 100 },
      s,
      file.businessCardOptions,
      file.businessCardDesignTiers
    );
    expect(result.printPrice).toBe(20000);
    expect(result.designFee).toBe(8000);
    expect(result.supplyPrice).toBe(28000);
    expect(result.vatAndTotal).toEqual({ vat: 2800, total: 30800 });
  });

  it("BNR-1 출력 1장", () => {
    const result = calcBanner({ outputQty: 1, indoorStandQty: 0, outdoorStandQty: 0 }, s);
    expect(result.supplyPrice).toBe(22000);
    expect(result.vatAndTotal).toEqual({ vat: 2200, total: 24200 });
  });

  it("BNR-MIX 출력 2, 실내 1, 실외 1", () => {
    const result = calcBanner({ outputQty: 2, indoorStandQty: 1, outdoorStandQty: 1 }, s);
    expect(result.supplyPrice).toBe(87000);
    expect(result.vatAndTotal).toEqual({ vat: 8700, total: 95700 });
  });
});
