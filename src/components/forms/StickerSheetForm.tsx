"use client";

import { useState, useMemo, useEffect } from "react";
import { calcStickerSheet } from "@/lib/calc/stickerSheet";
import type { Settings } from "@/lib/config/types";
import type { StickerRatesMap } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";
import { ResultCard } from "../cards/ResultCard";

const MATERIAL_LABELS: Record<string, string> = {
  Art: "아트지",
  Modjo: "모조지",
  Yupo: "유포지",
  TransparentDeadlong: "투명데드롱",
};

export interface StickerSheetFormProps {
  settings: Settings;
  stickerRates: StickerRatesMap;
  stickerSheetSizes: { a4: { width: number; height: number }; a3: { width: number; height: number } };
  defaultGapMm: number;
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

export function StickerSheetForm({
  settings,
  stickerRates,
  stickerSheetSizes,
  defaultGapMm,
  onReset,
  onSummaryChange,
}: StickerSheetFormProps) {
  const [materialKey, setMaterialKey] = useState("Art");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [qty, setQty] = useState("");
  const [gapMm, setGapMm] = useState(String(defaultGapMm));

  const rate = stickerRates[materialKey];
  const result = useMemo(() => {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const q = Number(qty);
    const g = Number(gapMm);
    if (!widthMm || !heightMm || !qty || isNaN(w) || isNaN(h) || isNaN(q) || q < 1) return null;
    if (isNaN(g) || g < 0) return null;
    if (!rate) return null;
    return calcStickerSheet(
      { materialKey, widthMm: w, heightMm: h, qty: q, gapMm: g },
      settings,
      stickerSheetSizes,
      rate
    );
  }, [materialKey, widthMm, heightMm, qty, gapMm, settings, stickerSheetSizes, rate]);

  const a4Supply = result?.a4 && !result.a4.disabled ? result.a4.supplyPrice : undefined;
  const a3Supply = result?.a3 && !result.a3.disabled ? result.a3.supplyPrice : undefined;
  const items = result
    ? [
        ...(result.a4.disabled ? [] : [{ label: "A4 공급가", value: result.a4.supplyPrice }]),
        ...(result.a3.disabled ? [] : [{ label: "A3 공급가", value: result.a3.supplyPrice }]),
      ]
    : [];

  useEffect(() => {
    onSummaryChange?.({
      mainValue: a4Supply ?? a3Supply,
      mainLabel: "공급가 (VAT 미포함)",
      items,
    });
  }, [a4Supply, a3Supply, items, onSummaryChange]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">재질</label>
        <select
          value={materialKey}
          onChange={(e) => setMaterialKey(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
        >
          {Object.keys(stickerRates).map((k) => (
            <option key={k} value={k}>
              {MATERIAL_LABELS[k] ?? k}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">스티커 폭 (mm)</label>
          <input
            type="number"
            min={1}
            value={widthMm}
            onChange={(e) => setWidthMm(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">스티커 높이 (mm)</label>
          <input
            type="number"
            min={1}
            value={heightMm}
            onChange={(e) => setHeightMm(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">수량</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">간격 (mm)</label>
          <input
            type="number"
            min={0}
            value={gapMm}
            onChange={(e) => setGapMm(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setWidthMm("");
          setHeightMm("");
          setQty("");
          setGapMm(String(defaultGapMm));
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ResultCard
          title="A4"
          disabled={result?.a4.disabled}
          disabledReason={result?.a4.disabledReason}
        >
          {result?.a4 && !result.a4.disabled && (
            <ul className="text-sm space-y-1">
              <li>장당 수량: {result.a4.perSheet}</li>
              <li>필요 매수: {result.a4.sheets}</li>
              <li>예상 시간: {result.a4.minutes}분</li>
              <li className="font-semibold">
                공급가: {new Intl.NumberFormat("ko-KR").format(result.a4.supplyPrice)}원
              </li>
              <li className="text-slate-600">
                VAT: {new Intl.NumberFormat("ko-KR").format(result.a4.vatAndTotal.vat)}원 / 총액:{" "}
                {new Intl.NumberFormat("ko-KR").format(result.a4.vatAndTotal.total)}원
              </li>
            </ul>
          )}
        </ResultCard>
        <ResultCard
          title="A3"
          disabled={result?.a3.disabled}
          disabledReason={result?.a3.disabledReason}
        >
          {result?.a3 && !result.a3.disabled && (
            <ul className="text-sm space-y-1">
              <li>장당 수량: {result.a3.perSheet}</li>
              <li>필요 매수: {result.a3.sheets}</li>
              <li>예상 시간: {result.a3.minutes}분</li>
              <li className="font-semibold">
                공급가: {new Intl.NumberFormat("ko-KR").format(result.a3.supplyPrice)}원
              </li>
              <li className="text-slate-600">
                VAT: {new Intl.NumberFormat("ko-KR").format(result.a3.vatAndTotal.vat)}원 / 총액:{" "}
                {new Intl.NumberFormat("ko-KR").format(result.a3.vatAndTotal.total)}원
              </li>
            </ul>
          )}
        </ResultCard>
      </div>
    </div>
  );
}
