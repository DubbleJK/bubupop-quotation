"use client";

import { useState, useMemo, useEffect } from "react";
import { calcPop, calcPopStandard, type PopStandardCut } from "@/lib/calc/pop";
import type { Settings } from "@/lib/config/types";
import type { SaleRecordSnapshot } from "../SaleQuoteRecord";
import type { SummaryPayload } from "../StickySummary";

export interface PopFormProps {
  settings: Settings;
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
  onRecordChange?: (snapshot: SaleRecordSnapshot | null) => void;
}

export function PopForm({ settings, onReset, onSummaryChange, onRecordChange }: PopFormProps) {
  const [mode, setMode] = useState<"standard" | "custom">("standard");
  const [cut, setCut] = useState<PopStandardCut>("4");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [qty, setQty] = useState("1");

  const standard = useMemo(() => {
    const q = Number(qty);
    if (mode !== "standard" || !Number.isInteger(q) || q < 1) return null;
    return calcPopStandard(cut, q, settings.vatRate);
  }, [mode, cut, qty, settings.vatRate]);

  const custom = useMemo(() => {
    const w = Number(widthMm);
    const h = Number(heightMm);
    const q = Number(qty);
    if (mode !== "custom" || !widthMm || !heightMm || !qty || isNaN(w) || isNaN(h) || isNaN(q) || q < 1) return null;
    return calcPop({ widthMm: w, heightMm: h, qty: q }, settings);
  }, [mode, widthMm, heightMm, qty, settings]);

  const items = useMemo(() => {
    if (standard) {
      return [
        { label: "규격", value: standard.label },
        { label: "장당 최종 금액", value: standard.each },
        { label: "수량", value: `${standard.qty}장` },
        { label: "공급가", value: standard.supplyPrice },
        { label: "부가세", value: standard.vat },
        { label: "최종 금액", value: standard.total },
      ];
    }
    if (!custom || custom.error) return [];
    return [
      { label: "임의 규격 소비 길이(m)", value: custom.lengthM.toFixed(2) },
      {
        label: "임의 규격 4절 공급가",
        value: custom.supply4Cut,
        sub: [
          { label: "VAT(10%)", value: custom.vatAndTotal4.vat },
          { label: "총액", value: custom.vatAndTotal4.total },
        ],
      },
      {
        label: "임의 규격 2절 공급가",
        value: custom.supply2Cut,
        sub: [
          { label: "VAT(10%)", value: custom.vatAndTotal2.vat },
          { label: "총액", value: custom.vatAndTotal2.total },
        ],
      },
    ];
  }, [standard, custom]);

  useEffect(() => {
    onSummaryChange?.({
      mainValue: standard?.total ?? (custom && !custom.error ? custom.supply4Cut : undefined),
      mainLabel: standard ? "최종 금액 (디자인·부가세 포함)" : "임의 규격 공급가 (4절, VAT 별도)",
      items,
      error: custom?.error,
    });
  }, [standard, custom, items, onSummaryChange]);

  useEffect(() => {
    if (standard) {
      onRecordChange?.({
        productId: "pop",
        label: `POP ${standard.label}`,
        supplyPrice: standard.supplyPrice,
        vat: standard.vat,
        total: standard.total,
        qty: standard.qty,
        input: { popCut: standard.cut },
      });
      return;
    }
    if (custom && !custom.error) {
      onRecordChange?.({
        productId: "pop",
        label: "POP 임의 규격 4절",
        supplyPrice: custom.supply4Cut,
        vat: custom.vatAndTotal4.vat,
        total: custom.vatAndTotal4.total,
        qty: Number(qty),
        widthMm: Number(widthMm),
        heightMm: Number(heightMm),
        input: { popCut: "custom" },
      });
      return;
    }
    onRecordChange?.(null);
  }, [standard, custom, qty, widthMm, heightMm, onRecordChange]);

  useEffect(() => () => onRecordChange?.(null), [onRecordChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`rounded-full px-3 py-2 text-sm ${mode === "standard" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`} onClick={() => setMode("standard")}>표준 규격</button>
        <button type="button" className={`rounded-full px-3 py-2 text-sm ${mode === "custom" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`} onClick={() => setMode("custom")}>임의 규격</button>
      </div>
      {mode === "standard" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">규격</label>
            <select value={cut} onChange={(e) => setCut(e.target.value === "2" ? "2" : "4")} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
              <option value="4">4절 · 25,000원</option>
              <option value="2">2절 · 30,000원</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">수량</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      ) : (
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
      )}
      <p className="text-xs text-slate-500">{mode === "standard" ? "표준 규격은 디자인비와 부가세가 포함된 최종 금액입니다. 부가세를 다시 더하지 않습니다." : "임의 규격은 가로·세로로 길이를 계산하는 기존 견적입니다. 표준 규격 고정가와 다릅니다."}</p>
      <button
        type="button"
        onClick={() => {
          setWidthMm("");
          setHeightMm("");
          setQty("1");
          setCut("4");
          setMode("standard");
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}
