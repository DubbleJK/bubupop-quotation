import { describe, expect, it } from "vitest";
import { calcVatAndTotal } from "@/lib/calc/common";
import { calcPop } from "@/lib/calc/pop";
import { calcStickerSheet } from "@/lib/calc/stickerSheet";
import { calcStickerSolvent } from "@/lib/calc/stickerSolvent";
import { calcDtf, combineDtfResults } from "@/lib/calc/dtf";
import { calcBusinessCard } from "@/lib/calc/businessCard";
import { getFileConfig, normalizeConfig } from "@/lib/config/fileConfig";
import type { AppConfig } from "@/lib/config/types";

const file = getFileConfig();
const s = file.settings;

describe("배치 불가와 미등록 옵션은 견적으로 확정하지 않는다", () => {
  it("비정상 금액은 부가세 계산에서 0원 견적이 되지 않고 빈 금액으로 멈춘다", () => {
    expect(calcVatAndTotal(Number.POSITIVE_INFINITY, s.vatRate)).toEqual({ vat: 0, total: 0 });
    expect(calcVatAndTotal(Number.NaN, s.vatRate)).toEqual({ vat: 0, total: 0 });
  });

  it("스티커 300×300mm는 A4와 A3 모두 배치 불가다", () => {
    const result = calcStickerSheet(
      { materialKey: "Art", widthMm: 300, heightMm: 300, qty: 2, gapMm: 5 },
      s,
      file.stickerSheetSizes,
      file.stickerRates.Art
    );
    expect(result.a4.disabled).toBe(true);
    expect(result.a4.perSheet).toBe(0);
    expect(result.a4.supplyPrice).toBe(0);
    expect(result.a3.disabled).toBe(true);
    expect(result.a3.perSheet).toBe(0);
  });

  it("스티커 300×250mm는 A4만 불가하고 A3는 실제 1개 배치로 계산한다", () => {
    const result = calcStickerSheet(
      { materialKey: "Art", widthMm: 300, heightMm: 250, qty: 30, gapMm: 5 },
      s,
      file.stickerSheetSizes,
      file.stickerRates.Art
    );
    expect(result.a4.disabled).toBe(true);
    expect(result.a4.disabledReason).toBe("이 용지에 배치할 수 없습니다.");
    expect(result.a3.disabled).toBeUndefined();
    expect(result.a3.perSheet).toBe(1);
    expect(result.a3.sheets).toBe(30);
    expect(result.a3.supplyPrice).toBe(44400);
    expect(result.a3.vatAndTotal).toEqual({ vat: 4440, total: 48840 });
  });

  it("솔벤트는 양쪽이 롤 폭을 넘으면 금액을 확정하지 않는다", () => {
    const result = calcStickerSolvent({ widthMm: 700, heightMm: 800, qty: 2, gapMm: 5 }, s);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("620mm");
    expect(result.supplyPrice).toBe(0);
    expect(Number.isFinite(result.lengthM)).toBe(true);
  });

  it("솔벤트는 들어가는 방향만 쓰고 POP 단가와 분리한다", () => {
    const fitted = calcStickerSolvent({ widthMm: 100, heightMm: 700, qty: 2, gapMm: 5 }, s);
    expect(fitted.ok).toBe(true);
    expect(fitted.lengthM).toBeCloseTo(0.705);
    expect(fitted.supplyPrice).toBe(59730);
    expect(fitted.vatAndTotal).toEqual({ vat: 5970, total: 65700 });

    const separated = calcStickerSolvent(
      { widthMm: 50, heightMm: 50, qty: 100, gapMm: 5 },
      { ...s, popSellPerM4: 1, solventSellPerM: 63452 }
    );
    expect(separated.supplyPrice).toBe(49900);
  });

  it("저장된 설정에 솔벤트 단가가 없으면 POP 4-cut 단가를 한 번만 복사한다", () => {
    const legacy = structuredClone(file) as AppConfig;
    delete legacy.settings.solventSellPerM;
    legacy.settings.popSellPerM4 = 11111;
    const migrated = normalizeConfig(legacy);
    expect(migrated.settings.solventSellPerM).toBe(11111);

    migrated.settings.popSellPerM4 = 22222;
    const again = normalizeConfig(migrated);
    expect(again.settings.solventSellPerM).toBe(11111);
    expect(again.settings.popSellPerM4).toBe(22222);

    const quoted = calcStickerSolvent(
      { widthMm: 50, heightMm: 50, qty: 100, gapMm: 5 },
      { ...s, solventSellPerM: again.settings.solventSellPerM, popSellPerM4: again.settings.popSellPerM4, workFeeSolvent: 15000 }
    );
    expect(quoted.supplyPrice).toBe(Math.round((15000 + 0.55 * 11111) / 10) * 10);
  });

  it("DTF 900×900mm는 유한한 오류 결과만 반환한다", () => {
    const result = calcDtf({ widthMm: 900, heightMm: 900, qty: 1 }, s);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("850mm");
    expect(result.lengthM).toBe(0);
    expect(result.supplyPrice).toBe(0);
    expect(result.vatAndTotal).toEqual({ vat: 0, total: 0 });
    expect(Number.isFinite(result.costReference)).toBe(true);
  });

  it("DTF 디자인 중 하나라도 배치 불가면 합산 견적을 만들지 않는다", () => {
    const good = calcDtf({ widthMm: 100, heightMm: 100, qty: 10 }, s);
    const bad = calcDtf({ widthMm: 900, heightMm: 900, qty: 1 }, s);
    const combined = combineDtfResults([good, null, bad], s.vatRate);
    expect(combined?.ok).toBe(false);
    expect(combined && "supplyPrice" in combined).toBe(false);

    const onlyGood = combineDtfResults([good, null], s.vatRate);
    expect(onlyGood?.ok).toBe(true);
    if (onlyGood?.ok) {
      expect(onlyGood.supplyPrice).toBe(2880);
      expect(onlyGood.vatAndTotal).toEqual({ vat: 290, total: 3170 });
    }
  });

  it("POP 오류 문구는 설정된 롤 폭을 보여 준다", () => {
    const result = calcPop(
      { widthMm: 700, heightMm: 800, qty: 1 },
      { ...s, popRollWidthMm: 500 }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("폭 초과(500mm) - 사이즈 확인");
    expect(result.supply4Cut).toBe(0);
  });

  it("명함은 등록되지 않은 매수와 용지를 오류로 반환한다", () => {
    const unknownQty = calcBusinessCard(
      { paperOptionId: "imported-same-day", designTierId: "basic", pcs: 300 },
      s,
      file.businessCardOptions,
      file.businessCardDesignTiers
    );
    expect(unknownQty.ok).toBe(false);
    expect(unknownQty.error).toBe("등록되지 않은 매수입니다.");
    expect(unknownQty.printPrice).toBe(0);
    expect(unknownQty.supplyPrice).toBe(0);

    const unknownPaper = calcBusinessCard(
      { paperOptionId: "missing-paper", designTierId: "basic", pcs: 100 },
      s,
      file.businessCardOptions,
      file.businessCardDesignTiers
    );
    expect(unknownPaper.ok).toBe(false);
    expect(unknownPaper.error).toBe("등록되지 않은 용지 옵션입니다.");

    const registered = calcBusinessCard(
      { paperOptionId: "imported-same-day", designTierId: "basic", pcs: 100 },
      s,
      file.businessCardOptions,
      file.businessCardDesignTiers
    );
    expect(registered.ok).toBe(true);
    expect(registered.printPrice).toBe(20000);
    expect(registered.supplyPrice).toBe(28000);
    expect(registered.vatAndTotal.total).toBe(30800);
  });
});
