/**
 * V1: 스티커 시트·티셔츠·명함·배너 등 단가/옵션 (config provider 통해 사용)
 */
export const stickerRates = {
  Art: { a4: 500, a3: 980, a3Available: true },
  Modjo: { a4: 500, a3: 980, a3Available: true },
  Yupo: { a4: 950, a3: 2100, a3Available: true },
  TransparentDeadlong: { a4: 950, a3: 0, a3Available: false },
} as const;

export const stickerSheetSizes = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
} as const;

export const tshirtTypes = [
  { id: "short", label: "반팔", unitPrice: 18000 },
  { id: "long", label: "긴팔", unitPrice: 20000 },
  { id: "hoodie", label: "후드", unitPrice: 25000 },
  { id: "windbreaker", label: "윈드브레이커", unitPrice: 35000 },
] as const;

export const tshirtSizeUpPer2XL = 3000;

export const tshirtDiscountTiers = [
  { minQty: 100, rate: 0.25 },
  { minQty: 50, rate: 0.2 },
  { minQty: 10, rate: 0.1 },
] as const;

export const businessCardOptions = [
  { id: "imported-same-day", label: "수입 당일제", prices: { 100: 20000, 200: 25000 } },
  { id: "art-paper", label: "아트지", prices: { 500: 15000 }, note: "500매(2~3일)" },
] as const;

export const businessCardDesignTiers = [
  { id: "output-only", label: "출력만", fee: 0 },
  { id: "basic", label: "베이직", fee: 8000 },
  { id: "standard", label: "스탠다드", fee: 20000 },
  { id: "premium", label: "프리미엄", fee: 30000 },
] as const;
