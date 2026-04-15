"use client";

import { useState, useMemo, useEffect } from "react";
import { calcPop } from "@/lib/calc/pop";
import type { Settings } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";

export interface PopFormProps {
  settings: Settings;
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

export function PopForm({ settings, onReset, onSummaryChange }: PopFormProps) {
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [qty, setQty] = useState("");

  const result = useMemo(() => {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const q = Number(qty);
    if (!widthMm || !heightMm || !qty || isNaN(w) || isNaN(h) || isNaN(q) || q < 1) return null;
    return calcPop({ widthMm: w, heightMm: h, qty: q }, settings);
  }, [widthMm, heightMm, qty, settings]);

  const mainSupply = result && !result.error ? result.supply4Cut : undefined;
  const items = useMemo(
    () =>
      result
        ? result.error
          ? []
          : [
              { label: "소비 길이(m)", value: result.lengthM.toFixed(2) },
              {
                label: "4-cut 공급가",
                value: result.supply4Cut,
                sub: [
                  { label: "VAT(10%)", value: result.vatAndTotal4.vat },
                  { label: "총액", value: result.vatAndTotal4.total },
                ],
              },
              {
                label: "2-cut 공급가",
                value: result.supply2Cut,
                sub: [
                  { label: "VAT(10%)", value: result.vatAndTotal2.vat },
                  { label: "총액", value: result.vatAndTotal2.total },
                ],
              },
            ]
        : [],
    [result]
  );

  useEffect(() => {
    onSummaryChange?.({
      mainValue: mainSupply,
      mainLabel: "공급가 (4-cut 기준, VAT 미포함)",
      items,
      error: result?.error,
    });
  }, [mainSupply, items, result?.error, onSummaryChange]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      </div>
      <button
        type="button"
        onClick={() => {
          setWidthMm("");
          setHeightMm("");
          setQty("");
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}
