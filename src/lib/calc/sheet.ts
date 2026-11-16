export interface SheetPlacement {
  ok: boolean;
  error?: string;
  perSheet: number;
  sheets: number;
  rotated: boolean;
  usableWidthMm?: number;
  usableHeightMm?: number;
  /** default-a4는 판재 규격이 없을 때의 기존 동작이다. 네스팅 결과가 아니다. */
  source: "sheet" | "manual";
}

/** 격자 배치. 마지막 칸 뒤의 간격까지 포함한 보수적인 계산이며, 곡선 네스팅이 아니다. */
export function placeOnSheet(input: {
  sheetWidthMm: number;
  sheetHeightMm: number;
  trimMm: number;
  gapMm: number;
  itemWidthMm: number;
  itemHeightMm: number;
  qty: number;
  allowRotate: boolean;
}): SheetPlacement {
  const usableW = input.sheetWidthMm - input.trimMm * 2;
  const usableH = input.sheetHeightMm - input.trimMm * 2;
  if (usableW <= 0 || usableH <= 0) {
    return { ok: false, error: "여백을 빼면 판재가 남지 않습니다.", perSheet: 0, sheets: 0, rotated: false, source: "sheet", usableWidthMm: usableW, usableHeightMm: usableH };
  }
  const count = (itemW: number, itemH: number) => {
    if (itemW <= 0 || itemH <= 0 || itemW > usableW || itemH > usableH) return 0;
    const cols = Math.floor((usableW + input.gapMm) / (itemW + input.gapMm));
    const rows = Math.floor((usableH + input.gapMm) / (itemH + input.gapMm));
    return Math.max(0, cols) * Math.max(0, rows);
  };
  const straight = count(input.itemWidthMm, input.itemHeightMm);
  const rotated = input.allowRotate ? count(input.itemHeightMm, input.itemWidthMm) : 0;
  const perSheet = Math.max(straight, rotated);
  if (perSheet < 1) {
    const reason = `배치할 수 없습니다. 판재 ${input.sheetWidthMm}×${input.sheetHeightMm}mm에서 사방 ${input.trimMm}mm를 빼면 ${usableW}×${usableH}mm입니다. 스티커 ${input.itemWidthMm}×${input.itemHeightMm}mm, 사이 간격 ${input.gapMm}mm. 간격은 스티커 사이에만 두며, 외곽 여백과 별개입니다.`;
    return { ok: false, error: reason, perSheet: 0, sheets: 0, rotated: false, source: "sheet", usableWidthMm: usableW, usableHeightMm: usableH };
  }
  return {
    ok: true,
    perSheet,
    sheets: Math.ceil(input.qty / perSheet),
    rotated: rotated > straight,
    source: "sheet",
    usableWidthMm: usableW,
    usableHeightMm: usableH,
  };
}
