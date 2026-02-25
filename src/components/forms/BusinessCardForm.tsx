"use client";

import { useState, useMemo, useEffect } from "react";
import { calcBusinessCard } from "@/lib/calc/businessCard";
import type { Settings } from "@/lib/config/types";
import type { BusinessCardOption, BusinessCardDesignTier } from "@/lib/config/types";
import type { SummaryPayload } from "../StickySummary";

export interface BusinessCardFormProps {
  settings: Settings;
  businessCardOptions: BusinessCardOption[];
  businessCardDesignTiers: BusinessCardDesignTier[];
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
}

export function BusinessCardForm({
  settings,
  businessCardOptions,
  businessCardDesignTiers,
  onReset,
  onSummaryChange,
}: BusinessCardFormProps) {
  const [paperOptionId, setPaperOptionId] = useState(businessCardOptions[0]?.id ?? "");
  const [designTierId, setDesignTierId] = useState(businessCardDesignTiers[0]?.id ?? "");
  const [pcs, setPcs] = useState<number | "">("");

  const selectedOption = businessCardOptions.find((o) => o.id === paperOptionId);
  const pcsOptions = selectedOption ? Object.keys(selectedOption.prices).map(Number) : [];
  const effectivePcs = pcs !== "" ? pcs : (pcsOptions[0] ?? 0);

  const result = useMemo(() => {
    return calcBusinessCard(
      { paperOptionId, designTierId, pcs: typeof effectivePcs === "number" ? effectivePcs : undefined },
      settings,
      businessCardOptions,
      businessCardDesignTiers
    );
  }, [
    paperOptionId,
    designTierId,
    effectivePcs,
    settings,
    businessCardOptions,
    businessCardDesignTiers,
  ]);

  const items = result
    ? result.designFee === 0
      ? [
          { label: "인쇄비 (공급가)", value: result.printPrice },
          { label: "VAT(10%)", value: result.vatAndTotal.vat },
          { label: "총액", value: result.vatAndTotal.total },
        ]
      : [
          { label: "인쇄비", value: result.printPrice },
          { label: "디자인비", value: result.designFee },
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
        <label className="block text-sm font-medium text-slate-700 mb-1">용지 옵션</label>
        <select
          value={paperOptionId}
          onChange={(e) => {
            const opt = businessCardOptions.find((o) => o.id === e.target.value);
            setPaperOptionId(e.target.value);
            setPcs(opt ? Object.keys(opt.prices).map(Number)[0] ?? "" : "");
          }}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
        >
          {businessCardOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} {o.note ? `(${o.note})` : ""}
            </option>
          ))}
        </select>
      </div>
      {pcsOptions.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">매수</label>
          <select
            value={String(effectivePcs)}
            onChange={(e) => setPcs(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            {pcsOptions.map((n) => (
              <option key={n} value={n}>
                {n}매
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">디자인 등급</label>
        <select
          value={designTierId}
          onChange={(e) => setDesignTierId(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
        >
          {businessCardDesignTiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.fee > 0 ? ` (${new Intl.NumberFormat("ko-KR").format(t.fee)}원)` : " — 디자인비 없음"}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => {
          setPaperOptionId(businessCardOptions[0]?.id ?? "");
          setDesignTierId(businessCardDesignTiers[0]?.id ?? "");
          const opt = businessCardOptions[0];
          setPcs(opt ? Object.keys(opt.prices).map(Number)[0] ?? "" : "");
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}
