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

/** 사용 단위 수량 구간의 개당 매입가. 고객 판매 할인과 별개다. */
export interface QtyPriceBand {
  minQty: number;
  /** 비우면 상한이 없다. */
  maxQty?: number;
  unitPrice: number;
}

export interface MaterialCost {
  id: string;
  label: string;
  kind: string;
  spec: string;
  /** 공급처. 비워도 된다. */
  supplier?: string;
  active: boolean;
  purchaseUnit: PurchaseUnit;
  usageUnit: UsageUnit;
  /** 구매단위 1개에 들어 있는 사용단위 수량. 단위가 같으면 1. */
  conversion?: number;
  /** 롤 배치에 쓰는 폭. 규격 글자와 별개이며, 비우면 배치 견적을 만들지 않는다. */
  rollWidthMm?: number;
  /** 판재·시트 배치에 쓰는 가로. 규격 글자와 별개다. */
  sheetWidthMm?: number;
  /** 판재·시트 배치에 쓰는 세로. */
  sheetHeightMm?: number;
  /** 두께. 계산에는 쓰지 않고 기록만 한다. */
  thicknessMm?: number;
  /** 롤 길이. 배치 길이 계산에는 쓰지 않는다. */
  rollLengthM?: number;
  conversionStatus: "confirmed" | "unconfirmed";
  price: CostAmount;
  /** 수량 구간 매입가. 있으면 그 구간의 사용단위 단가를 쓴다. */
  purchaseTiers?: QtyPriceBand[];
  /** 0.05는 5%. */
  wasteRate?: number;
  wasteStatus: "confirmed" | "unconfirmed";
  favorite?: boolean;
  updatedAt?: string;
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
  /** 인쇄, 전사, 커팅, 후가공, 디자인, 포장. 비어 있으면 미분류. */
  category?: string;
  active: boolean;
  favorite?: boolean;
  updatedAt?: string;
  method: ChargeMethod;
  variable?: CostAmount;
  laborPerMin?: CostAmount;
  equipmentPerMin?: CostAmount;
  minutes?: { value?: number; per: "ea" | "m" | "order"; status: CostStatus };
  setup?: CostAmount;
  /** 주문 수량 구간에 따라 바뀌는 단가. 판매 할인이 아니다. */
  quantityBands?: QtyPriceBand[];
  /** 이 공정의 최소 작업비. 계산액이 더 작으면 이 금액까지 올린다. */
  minCharge?: number;
  /** 이 수량보다 많은 주문은 관리자 확인. */
  reviewAboveQty?: number;
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

export interface RecipeOption {
  id: string;
  label: string;
}

export interface RecipeLine {
  lineId: string;
  refId: string;
  kind: "material" | "process";
  usage: RecipeUsage;
  /** 같은 줄을 몇 번 적용하는지. 비우면 1. 양면처럼 두 배로 만들지 않는다. */
  times?: number;
  /** 이 옵션을 견적에서 골랐을 때만 계산한다. 비우면 항상 계산한다. */
  optionId?: string;
  /** 판재·롤 배치에서 90도 회전을 비교한다. 비우면 허용이다. */
  allowRotate?: boolean;
  /** 격자 대신 관리자가 적은 한 장당 개수. 네스팅 결과가 아니다. */
  manualPerSheet?: number;
}

export interface ProductGroup {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
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
  /** 이 수량보다 많으면 생산·납기 확인 경고만 낸다. */
  reviewAboveQty?: number;
  groupId?: string;
  sortOrder?: number;
  favorite?: boolean;
  /** 견적에서 고르는 포장·인쇄·부가서비스. 고객 판매가를 바꾸지 않는다. */
  options?: RecipeOption[];
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
  /** 비어 있거나 없으면 그룹 없는 기존 자료다. */
  groups?: ProductGroup[];
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
  /** 견적에서 고른 품목 옵션. 없는 줄은 항상 계산한다. */
  optionIds?: string[];
}
