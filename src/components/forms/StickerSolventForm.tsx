"use client";

import { useState, useMemo, useEffect } from "react";
import { calcStickerSolvent } from "@/lib/calc/stickerSolvent";
import type { Settings } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";

export interface StickerSolventFormProps {
  settings: Settings;
  defaultGapMm: number;
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

export function StickerSolventForm({ settings, defaultGapMm, onReset, onSummaryChange }: StickerSolventFormProps) {
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [qty, setQty] = useState("");
  const [gapMm, setGapMm] = useState(String(defaultGapMm));

  const result = useMemo(() => {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const q = Number(qty);
    const g = Number(gapMm);
    if (!widthMm || !heightMm || !qty || isNaN(w) || isNaN(h) || isNaN(q) || q < 1) return null;
    if (isNaN(g) || g < 0) return null;
    return calcStickerSolvent({ widthMm: w, heightMm: h, qty: q, gapMm: g }, settings);
  }, [widthMm, heightMm, qty, gapMm, settings]);

  const items = result
    ? [
        { label: "소비 길이(m)", value: result.lengthM.toFixed(2) },
        { label: "공급가", value: result.supplyPrice },
        { label: "VAT(10%)", value: result.vatAndTotal.vat },
        { label: "총액", value: result.vatAndTotal.total },
      ]
    : [];

  useEffect(() => {
    onSummaryChange?.({
      mainValue: result?.supplyPrice,
      mainLabel: "공급가 (VAT 미포함)",
      items,
    });
  }, [result?.supplyPrice, items, onSummaryChange]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">폭 (mm)</label>
          <input
            type="number"
            min={1}
            value={widthMm}
            onChange={(e) => setWidthMm(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">높이 (mm)</label>
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
    </div>
  );
}
