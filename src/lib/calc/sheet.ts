export interface SheetPlacement {
  ok: boolean;
  error?: string;
  perSheet: number;
  sheets: number;
  rotated: boolean;
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
    return { ok: false, error: "여백을 빼면 판재가 남지 않습니다.", perSheet: 0, sheets: 0, rotated: false, source: "sheet" };
  }
  const count = (itemW: number, itemH: number) => {
    const pitchW = itemW + input.gapMm;
    const pitchH = itemH + input.gapMm;
    if (pitchW <= 0 || pitchH <= 0) return 0;
    return Math.floor(usableW / pitchW) * Math.floor(usableH / pitchH);
  };
  const straight = count(input.itemWidthMm, input.itemHeightMm);
  const rotated = input.allowRotate ? count(input.itemHeightMm, input.itemWidthMm) : 0;
  const perSheet = Math.max(straight, rotated);
  if (perSheet < 1) {
    return { ok: false, error: "이 크기는 판재에 배치할 수 없습니다.", perSheet: 0, sheets: 0, rotated: false, source: "sheet" };
  }
  return {
    ok: true,
    perSheet,
    sheets: Math.ceil(input.qty / perSheet),
    rotated: rotated > straight,
    source: "sheet",
  };
}
