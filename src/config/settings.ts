/**
 * V1: 모든 가격·기본값·상수 (UI에서 직접 사용하지 말고 config provider 통해 사용)
 */
export const settings = {
  vatRate: 0.1,
  defaultGapMm: 5,
  trimMarginMm: 5,
  minStickerSupply: 20000,
  workFeeStickerSheet: 15000,
  workFeeSolvent: 15000,
  /** 솔벤트 전용 판매 단가. 없으면 불러올 때 POP 4-cut 단가를 복사한다. */
  solventSellPerM: 63452,
  popSellPerM4: 63452,
  popSellPerM2: 55046,
  popRollWidthMm: 610,
  solventRollWidthMm: 620,
  dtfSellPerM: 13900,
  dtfCostPerM: 1350,
  dtfMinutesPerM: 5,
  dtfRollWidthMm: 850,
  dtfGapMm: 7,
  stickerCutSecondsPerSheet: 30,
  bannerBasePrice: 22000,
  bannerStandIndoor: 15000,
  bannerStandOutdoor: 28000,
} as const;
