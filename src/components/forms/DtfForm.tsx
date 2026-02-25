"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { calcDtf } from "@/lib/calc/dtf";
import { calcVatAndTotal } from "@/lib/calc/common";
import type { Settings } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";

export interface DtfFormProps {
  settings: Settings;
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

interface DtfItemRow {
  id: string;
  widthMm: string;
  heightMm: string;
  qty: string;
}

function newItem(): DtfItemRow {
  return {
    id: crypto.randomUUID?.() ?? `dtf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    widthMm: "",
    heightMm: "",
    qty: "",
  };
}

export function DtfForm({ settings, onReset, onSummaryChange }: DtfFormProps) {
  const [items, setItems] = useState<DtfItemRow[]>(() => [newItem()]);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, newItem()]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const updateItem = useCallback(
    (id: string, field: keyof Omit<DtfItemRow, "id">, value: string) => {
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      );
    },
    []
  );

  const results = useMemo(() => {
    return items.map((row) => {
      const w = Number(row.widthMm);
      const h = Number(row.heightMm);
      const n = Number(row.qty);
      if (
        !row.widthMm ||
        !row.heightMm ||
        !row.qty ||
        isNaN(w) ||
        isNaN(h) ||
        isNaN(n) ||
        w <= 0 ||
        h <= 0 ||
        n < 1
      )
        return null;
      return calcDtf({ widthMm: w, heightMm: h, qty: n }, settings);
    });
  }, [items, settings]);

  const totalResult = useMemo(() => {
    const valid = results.filter((r): r is NonNullable<typeof r> => r != null);
    if (valid.length === 0) return null;
    const supplyPrice = valid.reduce((s, r) => s + r.supplyPrice, 0);
    const vatAndTotal = calcVatAndTotal(supplyPrice, settings.vatRate);
    return {
      count: valid.length,
      lengthM: valid.reduce((s, r) => s + r.lengthM, 0),
      supplyPrice,
      vatAndTotal,
      costReference: valid.reduce((s, r) => s + r.costReference, 0),
      estimatedMinutes: valid.reduce((s, r) => s + r.estimatedMinutes, 0),
    };
  }, [results, settings.vatRate]);

  const summaryItems = totalResult
    ? [
        { label: "항목 수", value: `${totalResult.count}개 디자인` },
        { label: "총 사용 길이", value: `${totalResult.lengthM.toFixed(2)}m` },
        { label: "공급가", value: totalResult.supplyPrice },
        { label: "VAT(10%)", value: totalResult.vatAndTotal.vat },
        { label: "총액", value: totalResult.vatAndTotal.total },
        { label: "참고 원가", value: totalResult.costReference },
        { label: "예상 인쇄 시간", value: `${totalResult.estimatedMinutes}분` },
      ]
    : [];

  useEffect(() => {
    onSummaryChange?.({
      mainValue: totalResult?.supplyPrice,
      mainLabel: "공급가 (VAT 미포함)",
      items: summaryItems,
    });
  }, [totalResult?.supplyPrice, summaryItems, onSummaryChange]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((row, index) => (
          <div
            key={row.id}
            className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 min-w-0">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">가로 (mm)</span>
                <input
                  type="number"
                  min={1}
                  value={row.widthMm}
                  onChange={(e) => updateItem(row.id, "widthMm", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                  placeholder="예: 100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">세로 (mm)</span>
                <input
                  type="number"
                  min={1}
                  value={row.heightMm}
                  onChange={(e) => updateItem(row.id, "heightMm", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                  placeholder="예: 150"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">수량 (개)</span>
                <input
                  type="number"
                  min={1}
                  value={row.qty}
                  onChange={(e) => updateItem(row.id, "qty", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                  placeholder="예: 50"
                />
              </label>
            </div>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(row.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                title="항목 삭제"
                aria-label="항목 삭제"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
            {results[index] != null && (
              <p className="w-full text-xs text-slate-500 mt-1">
                {results[index]!.rotated ? "눕혀서 배치 적용 · " : ""}
                {results[index]!.lengthM.toFixed(2)}m
                {totalResult && totalResult.count > 1 && ` → ${results[index]!.supplyPrice.toLocaleString()}원`}
              </p>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-2 w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-lg font-medium">
            +
          </span>
          <span className="text-sm font-medium">항목 추가 (다른 디자인)</span>
        </button>
      </div>

      {totalResult && totalResult.count > 1 && (
        <p className="text-xs text-slate-500">
          디자인 {totalResult.count}개 합산 · 총 {totalResult.lengthM.toFixed(2)}m 기준 견적
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setItems([newItem()]);
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}
