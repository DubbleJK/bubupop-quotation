import type { AppConfig } from "@/lib/config/types";
import { calcBanner } from "@/lib/calc/banner";
import { calcBusinessCard } from "@/lib/calc/businessCard";
import { calcDtf } from "@/lib/calc/dtf";
import { calcPop } from "@/lib/calc/pop";
import { calcStickerSheet } from "@/lib/calc/stickerSheet";
import { calcStickerSolvent } from "@/lib/calc/stickerSolvent";
import { calcTshirt } from "@/lib/calc/tshirt";
import { calculateQuote } from "@/lib/calc/uvAcrylicKeyring";
import type { ProductRecipe, SimulationInput } from "./types";

export interface LegacySale {
  supplyPrice?: number;
  vat?: number;
  total?: number;
  /** UV 화면의 최종가. 공급가 비교와 따로 보여 준다. */
  finalPrice?: number;
  error?: string;
  label: string;
}

function sizeReady(input: SimulationInput): boolean {
  return (
    typeof input.widthMm === "number" &&
    input.widthMm > 0 &&
    typeof input.heightMm === "number" &&
    input.heightMm > 0 &&
    input.qty >= 1
  );
}

/** 기존 8개 계산 함수의 판매가만 읽는다. 원가 합계에 이 금액을 넣지 않는다. */
export function currentLegacySale(
  config: AppConfig,
  recipe: ProductRecipe,
  input: SimulationInput
): LegacySale | undefined {
  const id = recipe.legacyQuoteId;
  if (!id) return undefined;
  const s = config.settings;
  if (id === "pop") {
    if (!sizeReady(input)) return { label: "POP 4컷", error: "가로·세로·수량이 필요합니다." };
    const result = calcPop({ widthMm: input.widthMm ?? 0, heightMm: input.heightMm ?? 0, qty: input.qty }, s);
    if (!result.ok) return { label: "POP 4컷", error: result.error };
    return { label: "POP 4컷 공급가", supplyPrice: result.supply4Cut, vat: result.vatAndTotal4.vat, total: result.vatAndTotal4.total };
  }
  if (id === "dtf") {
    if (!sizeReady(input)) return { label: "DTF", error: "가로·세로·수량이 필요합니다." };
    const result = calcDtf({ widthMm: input.widthMm ?? 0, heightMm: input.heightMm ?? 0, qty: input.qty }, s);
    if (!result.ok) return { label: "DTF", error: result.error };
    return { label: "DTF 공급가", supplyPrice: result.supplyPrice, vat: result.vatAndTotal.vat, total: result.vatAndTotal.total };
  }
  if (id === "sticker-solvent") {
    if (!sizeReady(input)) return { label: "솔벤트", error: "가로·세로·수량이 필요합니다." };
    const result = calcStickerSolvent(
      { widthMm: input.widthMm ?? 0, heightMm: input.heightMm ?? 0, qty: input.qty, gapMm: input.gapMm ?? s.defaultGapMm },
      s
    );
    if (!result.ok) return { label: "솔벤트", error: result.error };
    return { label: "솔벤트 공급가", supplyPrice: result.supplyPrice, vat: result.vatAndTotal.vat, total: result.vatAndTotal.total };
  }
  if (id === "sticker-sheet") {
    if (!sizeReady(input)) return { label: "스티커 시트", error: "가로·세로·수량이 필요합니다." };
    const materialKey = input.materialKey ?? "Art";
    const rate = config.stickerRates[materialKey] ?? config.stickerRates.Art;
    const result = calcStickerSheet(
      {
        materialKey,
        widthMm: input.widthMm ?? 0,
        heightMm: input.heightMm ?? 0,
        qty: input.qty,
        gapMm: input.gapMm ?? s.defaultGapMm,
      },
      s,
      config.stickerSheetSizes,
      rate
    );
    const chosen = result.a4.disabled ? result.a3 : result.a4;
    if (chosen.disabled) return { label: "스티커 시트", error: chosen.disabledReason };
    return {
      label: result.a4.disabled ? "스티커 A3 공급가" : "스티커 A4 공급가",
      supplyPrice: chosen.supplyPrice,
      vat: chosen.vatAndTotal.vat,
      total: chosen.vatAndTotal.total,
    };
  }
  if (id === "tshirt") {
    const type = config.tshirtTypes.find((row) => row.id === (input.tshirtTypeId ?? "short"));
    const result = calcTshirt(
      { typeId: type?.id ?? "short", qty: input.qty, numberOf2XLPlus: input.numberOf2XLPlus ?? 0 },
      s,
      type,
      config.tshirtSizeUpPer2XL,
      config.tshirtDiscountTiers
    );
    return { label: "티셔츠 공급가", supplyPrice: result.supplyPrice, vat: result.vatAndTotal.vat, total: result.vatAndTotal.total };
  }
  if (id === "business-card") {
    const result = calcBusinessCard(
      {
        paperOptionId: input.paperOptionId ?? "imported-same-day",
        designTierId: input.designTierId ?? "basic",
        pcs: input.pcs ?? 100,
      },
      s,
      config.businessCardOptions,
      config.businessCardDesignTiers
    );
    if (!result.ok) return { label: "명함", error: result.error };
    return { label: "명함 공급가", supplyPrice: result.supplyPrice, vat: result.vatAndTotal.vat, total: result.vatAndTotal.total };
  }
  if (id === "banner") {
    const result = calcBanner(
      { outputQty: input.qty, indoorStandQty: input.indoorStandQty ?? 0, outdoorStandQty: input.outdoorStandQty ?? 0 },
      s
    );
    return { label: "배너 공급가", supplyPrice: result.supplyPrice, vat: result.vatAndTotal.vat, total: result.vatAndTotal.total };
  }
  const quote = calculateQuote({
    width: input.widthMm ?? 45,
    height: input.heightMm ?? 30,
    qty: input.qty,
  });
  return {
    label: "UV 공급가",
    supplyPrice: quote.supplyTotal,
    vat: quote.vat,
    total: quote.baseTotal,
    finalPrice: quote.finalPrice,
  };
}

export interface QuantityDrop {
  qty: number;
  price: number;
  previous: number;
}

/** 수량 증가 시 표시 금액이 내려가는 지점. 판매가는 바꾸지 않는다. */
export function scanDisplayedDrops(config: AppConfig, recipe: ProductRecipe): QuantityDrop[] {
  const drops: QuantityDrop[] = [];
  if (recipe.legacyQuoteId === "uv-acrylic-keyring") {
    let previous = 0;
    for (let qty = 1; qty <= 30; qty += 1) {
      const price = calculateQuote({ width: 45, height: 30, qty }).finalPrice;
      if (qty > 1 && price < previous) drops.push({ qty, price, previous });
      previous = price;
    }
    return drops;
  }
  if (recipe.legacyQuoteId === "tshirt") {
    const type = config.tshirtTypes.find((row) => row.id === "short") ?? config.tshirtTypes[0];
    let previous = 0;
    for (let qty = 1; qty <= 110; qty += 1) {
      const price = calcTshirt(
        { typeId: type?.id ?? "short", qty, numberOf2XLPlus: 0 },
        config.settings,
        type,
        config.tshirtSizeUpPer2XL,
        config.tshirtDiscountTiers
      ).supplyPrice;
      if (qty > 1 && price < previous) drops.push({ qty, price, previous });
      previous = price;
    }
  }
  return drops;
}
