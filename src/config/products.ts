/**
 * V1: 제품 목록 (드롭다운용 id + label)
 */
export const products = [
  { id: "pop", label: "POP" },
  { id: "sticker-sheet", label: "스티커 시트" },
  { id: "sticker-solvent", label: "스티커 솔벤트" },
  { id: "uv-acrylic-keyring", label: "UV아크릴키링" },
  { id: "dtf", label: "DTF" },
  { id: "tshirt", label: "티셔츠" },
  { id: "business-card", label: "명함" },
  { id: "banner", label: "배너" },
] as const;

export type ProductId = (typeof products)[number]["id"];
