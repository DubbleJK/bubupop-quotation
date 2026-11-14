/**
 * Config provider용 타입 (V2에서 API 응답과 동일한 형태로 사용)
 */
export interface Settings {
  vatRate: number;
  defaultGapMm: number;
  trimMarginMm: number;
  minStickerSupply: number;
  workFeeStickerSheet: number;
  workFeeSolvent: number;
  popSellPerM4: number;
  popSellPerM2: number;
  popRollWidthMm: number;
  solventRollWidthMm: number;
  dtfSellPerM: number;
  dtfCostPerM: number;
  dtfMinutesPerM: number;
  dtfRollWidthMm: number;
  dtfGapMm: number;
  stickerCutSecondsPerSheet: number;
  /** 관리자 인증용. 공개 견적 설정에는 포함하지 않는다. */
  loginPin?: string;
  bannerBasePrice: number;
  bannerStandIndoor: number;
  bannerStandOutdoor: number;
}

export interface ProductItem {
  id: string;
  label: string;
}

export type StickerMaterialKey = "Art" | "Modjo" | "Yupo" | "TransparentDeadlong";

export interface StickerRateItem {
  a4: number;
  a3: number;
  a3Available: boolean;
}

export interface StickerRatesMap {
  [key: string]: StickerRateItem;
}

export interface SheetSize {
  width: number;
  height: number;
}

export interface TshirtTypeItem {
  id: string;
  label: string;
  unitPrice: number;
}

export interface TshirtDiscountTier {
  minQty: number;
  rate: number;
}

export interface BusinessCardOption {
  id: string;
  label: string;
  prices: Record<number, number>;
  note?: string;
}

export interface BusinessCardDesignTier {
  id: string;
  label: string;
  fee: number;
}

/** 서버 저장이 성공할 때마다 올라가는 설정 버전. 구버전 JSON에는 없을 수 있다. */
export interface ConfigMeta {
  revision: number;
  updatedAt: string | null;
}

export interface AppConfig {
  settings: Settings;
  products: ProductItem[];
  stickerRates: StickerRatesMap;
  stickerSheetSizes: { a4: SheetSize; a3: SheetSize };
  tshirtTypes: TshirtTypeItem[];
  tshirtSizeUpPer2XL: number;
  tshirtDiscountTiers: TshirtDiscountTier[];
  businessCardOptions: BusinessCardOption[];
  businessCardDesignTiers: BusinessCardDesignTier[];
  configMeta?: ConfigMeta;
}
