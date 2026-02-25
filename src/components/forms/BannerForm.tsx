"use client";

import { useState, useMemo, useEffect } from "react";
import { calcBanner } from "@/lib/calc/banner";
import type { Settings } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";

export interface BannerFormProps {
  settings: Settings;
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

export function BannerForm({ settings, onReset, onSummaryChange }: BannerFormProps) {
  const [outputQty, setOutputQty] = useState("");
  const [indoorStandQty, setIndoorStandQty] = useState("");
  const [outdoorStandQty, setOutdoorStandQty] = useState("");

  const result = useMemo(() => {
    const out = Number(outputQty);
    const ind = Number(indoorStandQty);
    const outd = Number(outdoorStandQty);
    const o = isNaN(out) || out < 0 ? 0 : out;
    const i = isNaN(ind) || ind < 0 ? 0 : ind;
    const d = isNaN(outd) || outd < 0 ? 0 : outd;
    if (o === 0 && i === 0 && d === 0) return null;
    return calcBanner(
      { outputQty: o, indoorStandQty: i, outdoorStandQty: d },
      settings
    );
  }, [outputQty, indoorStandQty, outdoorStandQty, settings]);

  const items = result
    ? [
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

  const basePrice = settings.bannerBasePrice;
  const indoorPrice = settings.bannerStandIndoor;
  const outdoorPrice = settings.bannerStandOutdoor;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">출력물, 수량</span>
          <input
            type="number"
            min={0}
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="0"
          />
          <span className="text-xs text-slate-500">1장당 {basePrice.toLocaleString()}원</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">실내 거치대, 수량</span>
          <input
            type="number"
            min={0}
            value={indoorStandQty}
            onChange={(e) => setIndoorStandQty(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="0"
          />
          <span className="text-xs text-slate-500">1개당 {indoorPrice.toLocaleString()}원</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">실외 거치대, 수량</span>
          <input
            type="number"
            min={0}
            value={outdoorStandQty}
            onChange={(e) => setOutdoorStandQty(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="0"
          />
          <span className="text-xs text-slate-500">1개당 {outdoorPrice.toLocaleString()}원</span>
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          setOutputQty("");
          setIndoorStandQty("");
          setOutdoorStandQty("");
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}
