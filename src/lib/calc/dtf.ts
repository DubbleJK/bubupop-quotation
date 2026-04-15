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

  // 직배치(가로×세로) vs 눕힌 배치(세로×가로) 중 사용 길이가 짧은 쪽 선택
  const straight = layout(rollWidthMm, gapMm, widthMm, heightMm, qty);
  const rotated = layout(rollWidthMm, gapMm, heightMm, widthMm, qty);

  const useRotated = rotated.lengthM < straight.lengthM;
  const chosen = useRotated ? rotated : straight;

  const lengthM = chosen.lengthM;
  const supplyPrice = roundToNearest10(lengthM * s.dtfSellPerM);
  const costReference = roundToNearest10(lengthM * s.dtfCostPerM);
  const estimatedMinutes = Math.ceil(lengthM * s.dtfMinutesPerM);

  return {
    itemsPerRow: chosen.itemsPerRow,
    rows: chosen.rows,
    lengthM,
    rotated: useRotated,
    supplyPrice,
    vatAndTotal: calcVatAndTotal(supplyPrice, s.vatRate),
    costReference,
    estimatedMinutes,
  };
}
