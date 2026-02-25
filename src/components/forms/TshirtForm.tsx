"use client";

import { useState, useMemo, useEffect } from "react";
import { calcTshirt } from "@/lib/calc/tshirt";
import type { Settings } from "@/lib/config/types";
import type { TshirtTypeItem, TshirtDiscountTier } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";

export interface TshirtFormProps {
  settings: Settings;
  tshirtTypes: TshirtTypeItem[];
  tshirtSizeUpPer2XL: number;
  tshirtDiscountTiers: TshirtDiscountTier[];
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

export function TshirtForm({
  settings,
  tshirtTypes,
  tshirtSizeUpPer2XL,
  tshirtDiscountTiers,
  onReset,
  onSummaryChange,
}: TshirtFormProps) {
  const [typeId, setTypeId] = useState(tshirtTypes[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [numberOf2XLPlus, setNumberOf2XLPlus] = useState("");

  const typeItem = tshirtTypes.find((t) => t.id === typeId);
  const result = useMemo(() => {
    const q = Number(qty);
    const xl = Number(numberOf2XLPlus);
    if (!qty || isNaN(q) || q < 1) return null;
    if (isNaN(xl) || xl < 0 || xl > q) return null;
    return calcTshirt(
      { typeId, qty: q, numberOf2XLPlus: xl },
      settings,
      typeItem,
      tshirtSizeUpPer2XL,
      tshirtDiscountTiers
    );
  }, [typeId, qty, numberOf2XLPlus, settings, typeItem, tshirtSizeUpPer2XL, tshirtDiscountTiers]);

  const items = result
    ? [
        { label: "단가", value: result.unitPrice },
        { label: "할인율", value: `${result.discountRate * 100}%` },
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
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">종류</label>
        <select
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
        >
          {tshirtTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({new Intl.NumberFormat("ko-KR").format(t.unitPrice)}원)
            </option>
          ))}
        </select>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">2XL 이상 개수</label>
          <input
            type="number"
            min={0}
            value={numberOf2XLPlus}
            onChange={(e) => setNumberOf2XLPlus(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setQty("");
          setNumberOf2XLPlus("");
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}
