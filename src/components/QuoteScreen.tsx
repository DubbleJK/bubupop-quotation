"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { configProvider, describeQuoteSource } from "@/lib/config";
import type { AppConfig, QuoteConfigResolution } from "@/lib/config";
import { StickySummary, type SummaryPayload } from "@/components/StickySummary";
import { PopForm } from "@/components/forms/PopForm";
import { StickerSheetForm } from "@/components/forms/StickerSheetForm";
import { StickerSolventForm } from "@/components/forms/StickerSolventForm";
import { UvAcrylicKeyringForm } from "@/components/forms/UvAcrylicKeyringForm";
import { SaleQuoteRecord, type SaleRecordSnapshot } from "@/components/SaleQuoteRecord";
import { DtfForm } from "@/components/forms/DtfForm";
import { TshirtForm } from "@/components/forms/TshirtForm";
import { BusinessCardForm } from "@/components/forms/BusinessCardForm";
import { BannerForm } from "@/components/forms/BannerForm";
import type { PublicCatalog } from "@/lib/cost/publicCatalog";
import { QuoteHeader } from "@/components/QuoteHeader";
import { QuoteProductPicker } from "@/components/QuoteProductPicker";
import { StaffCostQuote } from "@/components/StaffCostQuote";

const emptySummary: SummaryPayload = {
  mainValue: undefined,
  mainLabel: "공급가 (VAT 별도)",
  items: [],
  error: undefined,
};

export function QuoteScreen() {
  const [resolution, setResolution] = useState<QuoteConfigResolution | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [productId, setProductId] = useState("pop");
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [role, setRole] = useState<"admin" | "staff" | null>(null);
  const [restoreReady, setRestoreReady] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [notice, setNotice] = useState("");
  const [clean, setClean] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [saleRecord, setSaleRecord] = useState<SaleRecordSnapshot | null>(null);

  const onRole = useCallback((next: "admin" | "staff" | null) => setRole(next), []);
  const onClean = useCallback((next: boolean) => setClean(next), []);

  useEffect(() => {
    void fetch("/api/admin/session").then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { role?: string };
      setRole(data.role === "staff" ? "staff" : "admin");
    }).catch(() => setRole(null));
  }, []);

  useEffect(() => {
    const urlProduct = new URLSearchParams(window.location.search).get("product");
    if (urlProduct) setProductId(urlProduct);
    else {
      try {
        const raw = sessionStorage.getItem("quotation_cost_draft");
        const draft = raw ? JSON.parse(raw) as { productId?: string } : null;
        if (draft?.productId) setProductId(draft.productId);
      } catch {
        /* 이 브라우저의 작성 중이던 견적만 복원한다. */
      }
    }
    setRestoreReady(true);
  }, []);

  useEffect(() => {
    void fetch("/api/catalog")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("catalog"))))
      .then((data: { catalog?: PublicCatalog }) => setCatalog(data.catalog ?? null))
      .catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResolution(null);
    void configProvider.loadQuoteConfig().then((next) => {
      if (!cancelled) setResolution(next);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const onSummaryChange = useCallback((payload: SummaryPayload) => setSummary(payload), []);
  const onSaleRecord = useCallback((snapshot: SaleRecordSnapshot | null) => setSaleRecord(snapshot), []);
  const handleProductChange = useCallback((id: string) => {
    setSummary(emptySummary);
    setSaleRecord(null);
    setProductId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("product", id);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, []);

  const resetQuote = (skipConfirm: boolean) => {
    const legacy = Boolean(resolution?.ready && resolution.config.products.some((item) => item.id === productId));
    if (!skipConfirm && (legacy || !clean) && !window.confirm("저장하지 않은 입력을 지우고 새 견적을 시작할까요? 선택한 품목은 유지됩니다.")) return;
    setNotice("");
    setSummary(emptySummary);
    setResetToken((value) => value + 1);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await res.json().catch(() => ({}))) as { role?: string };
    if (!res.ok) {
      setLoginError(res.status === 503 ? "서버 세션 설정을 확인하지 못했습니다." : "PIN이 올바르지 않습니다.");
      return;
    }
    setRole("admin");
    setPin("");
    setLoginOpen(false);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setRole(null);
    setLoginOpen(false);
  };

  const config: AppConfig | null = resolution?.ready ? resolution.config : null;
  const legacy = Boolean(config?.products.some((item) => item.id === productId));

  return (
    <div className="min-h-screen bg-slate-100">
      <QuoteHeader current="quote" role={role} onNewQuote={() => resetQuote(false)} onLogin={role !== "admin" ? () => setLoginOpen(true) : undefined} onLogout={role ? () => void logout() : undefined} />
      <main className="mx-auto max-w-6xl p-3 md:p-5">
        {loginOpen && role !== "admin" && (
          <form onSubmit={login} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-800">관리자 로그인</p>
            <p className="mt-1 text-sm text-slate-500">관리자 PIN을 입력하면 이 화면에서 원가와 견적 기록이 열립니다.</p>
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-3 w-full max-w-xs rounded-xl border border-slate-300 px-3 py-3 text-lg" placeholder="PIN" />
            {loginError && <p className="mt-2 text-sm text-red-600">{loginError}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => setLoginOpen(false)}>취소</button>
              <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">로그인</button>
            </div>
          </form>
        )}
        {!resolution && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">서버 가격 설정을 확인하는 중입니다. 확인 전에는 견적 금액을 표시하지 않습니다.</p>}
        {resolution && !resolution.ready && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p>서버 설정을 확인하지 못했습니다. 이 브라우저에 남아 있는 이전 설정으로 견적을 확정하지 않습니다.</p>
            <button type="button" className="mt-3 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white" onClick={() => setReloadKey((value) => value + 1)}>다시 확인</button>
          </div>
        )}
        {config && resolution?.ready && (
          <>
            <p className="mb-3 text-xs text-slate-500">{describeQuoteSource(resolution)}</p>
            <StaffCostQuote productId={productId} role={role} active={!legacy} restoreReady={restoreReady} resetToken={resetToken} onRole={onRole} onCleanChange={onClean} onNewQuote={() => resetQuote(true)}>
              {(view) => (
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900">견적 입력</h2>
                    <QuoteProductPicker
                      catalog={catalog}
                      productId={productId}
                      onSelect={(id) => {
                        if (id === productId) return;
                        if (!view.confirmSwitch()) return;
                        const nextLegacy = config.products.some((item) => item.id === id);
                        setNotice(legacy || nextLegacy ? "이 품목은 입력 항목이 달라 이전 공급가는 쓰지 않습니다." : "규격·수량·간격은 유지되고, 이전 공급가는 초기화됩니다.");
                        handleProductChange(id);
                      }}
                    />
                    {notice && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">{notice}</p>}
                    {legacy ? (
                      <div key={`${productId}-${resetToken}`} className="mt-4">
                        {productId === "pop" && <PopForm settings={config.settings} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "sticker-sheet" && <StickerSheetForm settings={config.settings} stickerRates={config.stickerRates} stickerSheetSizes={config.stickerSheetSizes} defaultGapMm={config.settings.defaultGapMm} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "sticker-solvent" && <StickerSolventForm settings={config.settings} defaultGapMm={config.settings.defaultGapMm} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "uv-acrylic-keyring" && <UvAcrylicKeyringForm settings={config.settings} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "dtf" && <DtfForm settings={config.settings} showCostReference={role === "admin"} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "tshirt" && <TshirtForm settings={config.settings} tshirtTypes={config.tshirtTypes} tshirtSizeUpPer2XL={config.tshirtSizeUpPer2XL} tshirtDiscountTiers={config.tshirtDiscountTiers} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "business-card" && <BusinessCardForm settings={config.settings} businessCardOptions={config.businessCardOptions} businessCardDesignTiers={config.businessCardDesignTiers} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                        {productId === "banner" && <BannerForm settings={config.settings} onReset={() => resetQuote(true)} onSummaryChange={onSummaryChange} onRecordChange={onSaleRecord} />}
                      </div>
                    ) : view.fields}
                  </section>
                  {legacy ? (
                    <aside id="quote-result" className="lg:sticky lg:top-4">
                      <StickySummary mainValue={summary.mainValue} mainLabel={summary.mainLabel} items={summary.items} error={summary.error} />
                      <SaleQuoteRecord role={role} snapshot={saleRecord} />
                    </aside>
                  ) : view.result}
                </div>
              )}
            </StaffCostQuote>
          </>
        )}
      </main>
    </div>
  );
}
