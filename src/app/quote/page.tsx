"use client";

import { useState, useEffect, useCallback } from "react";
import { configProvider, describeQuoteSource } from "@/lib/config";
import type { AppConfig, QuoteConfigResolution } from "@/lib/config";
import { ProductGridPicker } from "@/components/ProductGridPicker";
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
import { listedLegacyIds, type PublicCatalog } from "@/lib/cost/publicCatalog";
import { StaffCostQuote } from "@/components/StaffCostQuote";

const emptySummary: SummaryPayload = {
  mainValue: undefined,
  mainLabel: "공급가 (VAT 미포함)",
  items: [],
  error: undefined,
};

/**
 * 일반 페이지: 견적 계산만 가능
 * 품목 버튼 선택 → 입력 → 견적 결과 (?product= 로 품목 공유 가능)
 */
export default function QuotePage() {
  const [resolution, setResolution] = useState<QuoteConfigResolution | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** 서버 확인 전에는 품목을 고정해 서버/클라이언트 DOM을 맞춘다. */
  const [productId, setProductId] = useState("pop");
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary);
  const [publicIds, setPublicIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/catalog")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("catalog"))))
      .then((data: { catalog?: PublicCatalog }) => {
        if (!cancelled && data.catalog) setPublicIds(listedLegacyIds(data.catalog));
      })
      .catch(() => {
        if (!cancelled) setPublicIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publicIds || publicIds.length === 0) return;
    const urlParam = new URLSearchParams(window.location.search).get("product");
    if (urlParam) return;
    if (!publicIds.includes(productId)) setProductId(publicIds[0] ?? "pop");
  }, [publicIds, productId]);

  useEffect(() => {
    let cancelled = false;
    setResolution(null);
    const urlParam = new URLSearchParams(window.location.search).get("product");
    void configProvider.loadQuoteConfig().then((next) => {
      if (cancelled) return;
      setResolution(next);
      if (urlParam) setProductId(urlParam);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const onSummaryChange = useCallback((payload: SummaryPayload) => {
    setSummary(payload);
  }, []);

  const handleProductChange = useCallback(
    (id: string) => {
      setSummary(emptySummary);
      setProductId(id);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("product", id);
        window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    /* 기존과 동일: 부모 품목은 유지, 자식 폼이 내부 상태만 초기화 */
  }, []);

  const config: AppConfig | null = resolution?.ready ? resolution.config : null;

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
      <main className="max-w-6xl mx-auto p-3 md:p-5">
        {!resolution && (
          <p className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
            서버 가격 설정을 확인하는 중입니다. 확인 전에는 견적 금액을 표시하지 않습니다.
          </p>
        )}
        {resolution && !resolution.ready && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-3">
            <p>서버 설정을 확인하지 못했습니다. 이 브라우저에 남아 있는 이전 설정으로 견적을 확정하지 않습니다.</p>
            <button
              type="button"
              onClick={() => setReloadKey((n) => n + 1)}
              className="bg-slate-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              다시 확인
            </button>
          </div>
        )}
        {config && resolution?.ready && (
          <>
        <p className="mb-3 text-xs text-slate-500">{describeQuoteSource(resolution)}</p>
        <div className="mb-4">
          {config.products.some((item) => item.id === productId) ? (
          <ProductGridPicker
            products={publicIds ? config.products.filter((item) => publicIds.includes(item.id) || item.id === productId) : config.products}
            value={productId}
            onChange={handleProductChange}
          />
          ) : (
            <StaffCostQuote productId={productId} />
          )}
        </div>
        {config.products.some((item) => item.id === productId) && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
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
                <UvAcrylicKeyringForm onReset={handleReset} onSummaryChange={onSummaryChange} />
              )}
              {productId === "dtf" && (
                <DtfForm settings={config.settings} onReset={handleReset} onSummaryChange={onSummaryChange} />
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
                <BannerForm settings={config.settings} onReset={handleReset} onSummaryChange={onSummaryChange} />
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-4">
              <StickySummary
                mainValue={summary.mainValue}
                mainLabel={summary.mainLabel}
                items={summary.items}
                error={summary.error}
              />
            </div>
          </div>
        </div>}
          </>
        )}
      </main>
    </div>
  );
}
