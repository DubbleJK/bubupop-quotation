"use client";

import { useState, useEffect, useCallback } from "react";
import { configProvider } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { ProductSelector } from "@/components/ProductSelector";
import { StickySummary } from "@/components/StickySummary";
import type { SummaryPayload } from "@/components/StickySummary";
import { PopForm } from "@/components/forms/PopForm";
import { StickerSheetForm } from "@/components/forms/StickerSheetForm";
import { StickerSolventForm } from "@/components/forms/StickerSolventForm";
import { UvAcrylicKeyringForm } from "@/components/forms/UvAcrylicKeyringForm";
import { DtfForm } from "@/components/forms/DtfForm";
import { TshirtForm } from "@/components/forms/TshirtForm";
import { BusinessCardForm } from "@/components/forms/BusinessCardForm";
import { BannerForm } from "@/components/forms/BannerForm";
import { PORTAL_URL } from "@/lib/portalUrl";

const emptySummary: SummaryPayload = {
  mainValue: undefined,
  mainLabel: "공급가 (VAT 미포함)",
  items: [],
  error: undefined,
};

/**
 * 일반 페이지: 견적 계산만 가능 (마인드맵 기준)
 * 주문종류 선택 → 가로/세로/사이즈 입력 → 견적 결과
 */
export default function QuotePage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [productId, setProductId] = useState("pop");
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary);

  useEffect(() => {
    configProvider.getAllConfig().then(setConfig);
  }, []);

  const onSummaryChange = useCallback((payload: SummaryPayload) => {
    setSummary(payload);
  }, []);

  const handleReset = () => {
    setProductId((id) => id);
  };

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">설정 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <a
          href={PORTAL_URL}
          target="_self"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          HOME
        </a>
        <h1 className="text-xl font-semibold text-slate-800">견적 계산</h1>
        <span className="w-14" />
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="mb-6">
          <ProductSelector
            products={config.products}
            value={productId}
            onChange={setProductId}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 shadow-sm">
              {productId === "pop" && (
                <PopForm
                  settings={config.settings}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "sticker-sheet" && (
                <StickerSheetForm
                  settings={config.settings}
                  stickerRates={config.stickerRates}
                  stickerSheetSizes={config.stickerSheetSizes}
                  defaultGapMm={config.settings.defaultGapMm}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "sticker-solvent" && (
                <StickerSolventForm
                  settings={config.settings}
                  defaultGapMm={config.settings.defaultGapMm}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "uv-acrylic-keyring" && (
                <UvAcrylicKeyringForm
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "dtf" && (
                <DtfForm
                  settings={config.settings}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "tshirt" && (
                <TshirtForm
                  settings={config.settings}
                  tshirtTypes={config.tshirtTypes}
                  tshirtSizeUpPer2XL={config.tshirtSizeUpPer2XL}
                  tshirtDiscountTiers={config.tshirtDiscountTiers}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "business-card" && (
                <BusinessCardForm
                  settings={config.settings}
                  businessCardOptions={config.businessCardOptions}
                  businessCardDesignTiers={config.businessCardDesignTiers}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
              {productId === "banner" && (
                <BannerForm
                  settings={config.settings}
                  onReset={handleReset}
                  onSummaryChange={onSummaryChange}
                />
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <StickySummary
              mainValue={summary.mainValue}
              mainLabel={summary.mainLabel}
              items={summary.items}
              error={summary.error}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
