/** 판매 설정과 분리된 원가 라이브러리. 공개 견적 응답에 넣지 않는다. */

export type CostUnit =
  | "krw-per-m"
  | "krw-per-m2"
  | "krw-per-sheet"
  | "krw-per-ea"
  | "krw-per-min"
  | "krw-per-order";

export type CostStatus = "confirmed" | "code-reference" | "unconfirmed";

export interface CostAmount {
  amount?: number;
  unit: CostUnit;
  /** exclusive: 부가세 별도 공급가. inclusive: 부가세 포함 매입가. */
  tax: "exclusive" | "inclusive";
  status: CostStatus;
  /** 이 단가가 적용되기 시작하는 날짜. YYYY-MM-DD. */
  effectiveFrom: string;
  note?: string;
}

export interface CostChange {
  revision: number;
  at: string;
  field: string;
  before?: number | string;
  after?: number | string;
}

export type PurchaseUnit = "roll" | "box" | "m" | "m2" | "sheet" | "ea";
export type UsageUnit = "m" | "m2" | "sheet" | "ea";

export interface MaterialCost {
  id: string;
  label: string;
  kind: string;
  spec: string;
  active: boolean;
  purchaseUnit: PurchaseUnit;
  usageUnit: UsageUnit;
  /** 구매단위 1개에 들어 있는 사용단위 수량. 단위가 같으면 1. */
  conversion?: number;
  conversionStatus: "confirmed" | "unconfirmed";
  price: CostAmount;
  /** 0.05는 5%. */
  wasteRate?: number;
  wasteStatus: "confirmed" | "unconfirmed";
  history: CostChange[];
}

export type ChargeMethod =
  | "per-ea"
  | "per-sheet"
  | "per-m"
  | "per-m2"
  | "per-minute"
  | "per-order"
  | "setup-plus-qty";

export interface ProcessDef {
  id: string;
  label: string;
  active: boolean;
  method: ChargeMethod;
  variable?: CostAmount;
  laborPerMin?: CostAmount;
  equipmentPerMin?: CostAmount;
  minutes?: { value?: number; per: "ea" | "m" | "order"; status: CostStatus };
  setup?: CostAmount;
  history: CostChange[];
}

export interface EquipmentCost {
  id: string;
  label: string;
  price: CostAmount;
  rollWidthMm?: number;
  history: CostChange[];
}

export type RecipeUsage =
  | "per-order"
  | "per-piece"
  | "per-meter-layout"
  | "per-sheet-imposition"
  | "per-m2";

export interface RecipeLine {
  lineId: string;
  refId: string;
  kind: "material" | "process";
  usage: RecipeUsage;
}

export type LegacyQuoteId =
  | "pop"
  | "sticker-sheet"
  | "sticker-solvent"
  | "uv-acrylic-keyring"
  | "dtf"
  | "tshirt"
  | "business-card"
  | "banner";

export interface ProductRecipe {
  productId: string;
  label: string;
  active: boolean;
  legacyQuoteId?: LegacyQuoteId;
  lines: RecipeLine[];
  /** 관리자가 직접 적은 고정 공급가. 고객 견적에는 자동 반영하지 않는다. */
  fixedSupplyPrice?: number;
  /** 추천가 승인 기록. 고객 견적 판매가를 바꾸지 않는다. */
  approvedSupplyPrice?: number;
  /** 새 품목을 고객 목록에 올릴 준비. 기존 8개 견적 분기는 이 값과 무관하다. */
  showOnCustomerQuote: boolean;
}

export interface MarginPolicy {
  productId: string;
  minimumRate?: number;
  targetRate?: number;
  highRate?: number;
  effectiveFrom: string;
  revision: number;
  history: CostChange[];
}

export interface CostLibrary {
  revision: number;
  updatedAt: string | null;
  materials: MaterialCost[];
  processes: ProcessDef[];
  equipment: EquipmentCost[];
  recipes: ProductRecipe[];
  margins: MarginPolicy[];
}

export interface SimulationInput {
  productId: string;
  qty: number;
  widthMm?: number;
  heightMm?: number;
  gapMm?: number;
  materialKey?: string;
  tshirtTypeId?: string;
  numberOf2XLPlus?: number;
  paperOptionId?: string;
  designTierId?: string;
  pcs?: number;
  indoorStandQty?: number;
  outdoorStandQty?: number;
}
