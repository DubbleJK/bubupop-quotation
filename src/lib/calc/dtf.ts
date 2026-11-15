/**
 * DTF: 가로·세로·수량 입력 → 7mm 간격, 85cm 폭 기준으로 사용 길이(m) 산출 후 견적
 */
import { roundToNearest10, calcVatAndTotal, type VatAndTotal } from "./common";
import type { Settings } from "@/lib/config/types";

export interface DtfInput {
  widthMm: number;
  heightMm: number;
  qty: number;
}

export interface DtfResult {
  ok: boolean;
  error?: string;
  /** 85cm 폭 안에 한 행에 들어가는 개수 */
  itemsPerRow: number;
  /** 필요한 행 수 */
  rows: number;
  /** 산출된 사용 길이 (m) */
  lengthM: number;
  /** true: 눕혀서(가로×세로 → 세로×가로) 배치가 더 유리해 선택됨 */
  rotated: boolean;
  supplyPrice: number;
  vatAndTotal: VatAndTotal;
  costReference: number;
  estimatedMinutes: number;
}

export interface RollPlacement {
  ok: boolean;
  error?: string;
  itemsPerRow: number;
  rows: number;
  lengthM: number;
  rotated: boolean;
}

/** 롤 폭 방향 크기 w, 진행 방향 크기 h 일 때 레이아웃 결과. w가 롤 폭을 넘으면 사용 불가(Infinity 반환). */
function layout(
  rollWidthMm: number,
  gapMm: number,
  w: number,
  h: number,
  qty: number
): { itemsPerRow: number; rows: number; lengthM: number } {
  if (w > rollWidthMm) {
    return { itemsPerRow: 0, rows: 0, lengthM: Infinity };
  }
  const itemsPerRow = Math.max(1, Math.floor((rollWidthMm + gapMm) / (w + gapMm)));
  const rows = Math.ceil(qty / itemsPerRow);
  const totalLengthMm = rows * h + (rows - 1) * gapMm;
  return { itemsPerRow, rows, lengthM: totalLengthMm / 1000 };
}

/** 고객 DTF 판매가와 원가 배치가 같은 규칙을 쓴다. 로스율은 여기서 넣지 않는다. */
export function placeOnRoll(input: {
  rollWidthMm: number;
  gapMm: number;
  widthMm: number;
  heightMm: number;
  qty: number;
}): RollPlacement {
  const { rollWidthMm, gapMm, widthMm, heightMm, qty } = input;
  const straight = layout(rollWidthMm, gapMm, widthMm, heightMm, qty);
  const rotated = layout(rollWidthMm, gapMm, heightMm, widthMm, qty);
  const straightOk = Number.isFinite(straight.lengthM);
  const rotatedOk = Number.isFinite(rotated.lengthM);
  if (!straightOk && !rotatedOk) {
    return {
      ok: false,
      error: `롤 폭(${rollWidthMm}mm)에 배치할 수 없습니다.`,
      itemsPerRow: 0,
      rows: 0,
      lengthM: 0,
      rotated: false,
    };
  }
  const useRotated = rotatedOk && (!straightOk || rotated.lengthM < straight.lengthM);
  const chosen = useRotated ? rotated : straight;
  return {
    ok: true,
    itemsPerRow: chosen.itemsPerRow,
    rows: chosen.rows,
    lengthM: chosen.lengthM,
    rotated: useRotated,
  };
}

export function calcDtf(
  input: DtfInput,
  s: Pick<
    Settings,
    "dtfSellPerM" | "dtfCostPerM" | "dtfMinutesPerM" | "dtfRollWidthMm" | "dtfGapMm" | "vatRate"
  >
): DtfResult {
  const { widthMm, heightMm, qty } = input;
  const rollWidthMm = s.dtfRollWidthMm ?? 850;
  const gapMm = s.dtfGapMm ?? 7;
  const placed = placeOnRoll({ rollWidthMm, gapMm, widthMm, heightMm, qty });
  if (!placed.ok) {
    return {
      ok: false,
      error: placed.error,
      itemsPerRow: 0,
      rows: 0,
      lengthM: 0,
      rotated: false,
      supplyPrice: 0,
      vatAndTotal: { vat: 0, total: 0 },
      costReference: 0,
      estimatedMinutes: 0,
    };
  }

  const lengthM = placed.lengthM;
  const supplyPrice = roundToNearest10(lengthM * s.dtfSellPerM);
  const costReference = roundToNearest10(lengthM * s.dtfCostPerM);
  const estimatedMinutes = Math.ceil(lengthM * s.dtfMinutesPerM);

  return {
    ok: true,
    itemsPerRow: placed.itemsPerRow,
    rows: placed.rows,
    lengthM,
    rotated: placed.rotated,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
    costReference,
    estimatedMinutes,
  };
}

export type DtfCombined =
  | { ok: false; error: string; count: number }
  | {
      ok: true;
      count: number;
      lengthM: number;
      supplyPrice: number;
      vatAndTotal: VatAndTotal;
      costReference: number;
      estimatedMinutes: number;
    };

/** 완성된 디자인 중 하나라도 배치 불가면 합산 금액을 만들지 않는다. 미입력 행(null)은 제외한다. */
export function combineDtfResults(
  results: Array<DtfResult | null>,
  vatRate: number
): DtfCombined | null {
  const completed = results.filter((row): row is DtfResult => row != null);
  if (completed.length === 0) return null;
  const failed = completed.find((row) => !row.ok);
  if (failed) {
    return {
      ok: false,
      error: failed.error ?? "배치할 수 없는 디자인이 있습니다.",
      count: completed.length,
    };
  }
  const supplyPrice = completed.reduce((sum, row) => sum + row.supplyPrice, 0);
  return {
    ok: true,
    count: completed.length,
    lengthM: completed.reduce((sum, row) => sum + row.lengthM, 0),
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, vatRate),
    costReference: completed.reduce((sum, row) => sum + row.costReference, 0),
    estimatedMinutes: completed.reduce((sum, row) => sum + row.estimatedMinutes, 0),
  };
}
