import { describe, expect, it } from "vitest";
import { calcPop, calcPopStandard } from "@/lib/calc/pop";
import { calcTshirt, tshirtSizeError } from "@/lib/calc/tshirt";
import { isLegacySaleProduct } from "@/config/products";
import { chosenSaleRecord, saleRecordBody, type SaleRecordSnapshot } from "@/components/SaleQuoteRecord";
import { acrylicBoardPlacement, acrylicBoardText, calculateQuote, uvRecordAmounts } from "@/lib/calc/uvAcrylicKeyring";
import { getFileConfig } from "@/lib/config/fileConfig";
import { currentLegacySale } from "@/lib/cost/legacySale";
import type { LegacyQuoteId, ProductRecipe } from "@/lib/cost/types";

const config = getFileConfig();
const s = config.settings;
const short = config.tshirtTypes.find((item) => item.id === "short");
const recipe = (legacyQuoteId: LegacyQuoteId): ProductRecipe => ({
  productId: legacyQuoteId,
  label: legacyQuoteId,
  active: true,
  legacyQuoteId,
  lines: [],
  showOnCustomerQuote: true,
});

describe("판매가 수정", () => {
  it("POP 표준 규격은 고정 최종가에 수량을 곱하고 부가세를 다시 더하지 않는다", () => {
    const four = calcPopStandard("4", 1, s.vatRate);
    const two = calcPopStandard("2", 1, s.vatRate);
    const twoSheets = calcPopStandard("4", 2, s.vatRate);
    expect(four.total).toBe(25000);
    expect(two.total).toBe(30000);
    expect(twoSheets.total).toBe(50000);
    for (const row of [four, two, twoSheets]) {
      expect(row.supplyPrice + row.vat).toBe(row.total);
    }
    const custom = calcPop({ widthMm: 200, heightMm: 200, qty: 10 }, s);
    expect(custom.supply4Cut).toBe(126900);
    expect(custom.vatAndTotal4.total).toBe(139590);
    const recorded = saleRecordBody({
      productId: "pop",
      label: "POP 4절",
      supplyPrice: four.supplyPrice,
      vat: four.vat,
      total: four.total,
      qty: 1,
      input: { popCut: "4" },
    }, "김담당", "");
    expect(recorded.presentedSupplyPrice + recorded.presentedVat).toBe(recorded.presentedTotal);
    expect(recorded.presentedTotal).toBe(25000);
    expect(isLegacySaleProduct("uv-acrylic-keyring")).toBe(true);
    expect(isLegacySaleProduct("cost-only")).toBe(false);
    const sheet: SaleRecordSnapshot = {
      productId: "sticker-sheet",
      label: "스티커 시트",
      supplyPrice: 20000,
      vat: 2000,
      total: 22000,
      qty: 10,
      choices: [
        { id: "A4", supplyPrice: 20000, vat: 2000, total: 22000, sheets: 8 },
        { id: "A3", supplyPrice: 25000, vat: 2500, total: 27500, sheets: 4 },
      ],
    };
    expect(chosenSaleRecord(sheet, "A3")?.sheets).toBe(4);
    expect(chosenSaleRecord(sheet, "A3")?.supplyPrice).toBe(25000);
    expect(chosenSaleRecord(sheet, "")?.id).toBe("A4");
    const saved = currentLegacySale(config, recipe("pop"), { productId: "pop", qty: 1, popCut: "4" });
    expect(saved?.total).toBe(25000);
    expect((saved?.supplyPrice ?? 0) + (saved?.vat ?? 0)).toBe(saved?.total);
  });

  it("티셔츠 할인은 구간 수량에만 적용되고 총액은 내려가지 않는다", () => {
    const price = (qty: number) =>
      calcTshirt(
        { typeId: "short", qty, numberOf2XLPlus: 0 },
        s,
        short,
        config.tshirtSizeUpPer2XL,
        config.tshirtDiscountTiers
      );
    expect(price(9).supplyPrice).toBe(162000);
    expect(price(10).supplyPrice).toBe(178200);
    expect(price(49).supplyPrice).toBe(810000);
    expect(price(50).supplyPrice).toBe(824400);
    expect(price(99).supplyPrice).toBe(1530000);
    expect(price(100).supplyPrice).toBe(1543500);
    const hundred = price(100);
    expect(hundred.bands.map((band) => band.rate)).toEqual([0, 0.1, 0.2, 0.25]);
    expect(hundred.discountAmount).toBe(18000 * 100 - 1543500);
    for (let qty = 2; qty <= 120; qty += 1) expect(price(qty).supplyPrice).toBeGreaterThan(price(qty - 1).supplyPrice);
    expect(tshirtSizeError(1, 2)).toBe("2XL 이상 수량은 총수량을 초과할 수 없습니다");
    expect(tshirtSizeError(2, 2)).toBeNull();
  });

  it("UV 1개는 최종 6,000원이고 공급가와 부가세의 합도 6,000원이다", () => {
    const quote = calculateQuote({ width: 40, height: 40, qty: 1 });
    expect(quote.finalPrice).toBe(6000);
    expect(quote.supplyTotal + quote.vat).toBe(6000);
    expect(quote.baseTotal).toBe(6000);
    const small = calculateQuote({ width: 20, height: 20, qty: 1 });
    expect(small.finalPrice).toBe(6000);
    expect(calculateQuote({ width: 45, height: 30, qty: 2 }).finalPrice).toBe(4562);
    expect(calculateQuote({ width: 45, height: 30, qty: 100 }).finalPrice).toBe(154193);
    const recorded = uvRecordAmounts(quote);
    expect(recorded).toEqual({ presentedSupplyPrice: 5450, presentedVat: 550, presentedTotal: 6000 });
    const bulk = uvRecordAmounts(calculateQuote({ width: 45, height: 30, qty: 2 }));
    expect(bulk.presentedTotal).toBe(4562);
    expect(bulk.presentedVat).toBe(calculateQuote({ width: 45, height: 30, qty: 2 }).vat);
    const board = (qty: number) => acrylicBoardPlacement({ width: 40, height: 40, qty, gapMm: 5, trimMm: s.trimMarginMm });
    expect(board(54).perSheet).toBe(54);
    expect(board(54).sheets).toBe(1);
    expect(board(55).sheets).toBe(2);
    expect(acrylicBoardText(board(55))).toBe("판재 300×430mm · 장당 54개 배치 · 필요 판재 2장");
    const saved = currentLegacySale(config, recipe("uv-acrylic-keyring"), { productId: "uv-acrylic-keyring", qty: 1, widthMm: 40, heightMm: 40 });
    expect(saved?.finalPrice).toBe(6000);
    expect((saved?.supplyPrice ?? 0) + (saved?.vat ?? 0)).toBe(6000);
    expect(saved?.total).toBe(6000);
  });
});
