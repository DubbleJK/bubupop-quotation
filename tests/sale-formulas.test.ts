import { describe, expect, it } from "vitest";
import { calcPop, calcPopStandard } from "@/lib/calc/pop";
import { calcTshirt } from "@/lib/calc/tshirt";
import { calculateQuote } from "@/lib/calc/uvAcrylicKeyring";
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
    const saved = currentLegacySale(config, recipe("uv-acrylic-keyring"), { productId: "uv-acrylic-keyring", qty: 1, widthMm: 40, heightMm: 40 });
    expect(saved?.finalPrice).toBe(6000);
    expect((saved?.supplyPrice ?? 0) + (saved?.vat ?? 0)).toBe(6000);
    expect(saved?.total).toBe(6000);
  });
});
