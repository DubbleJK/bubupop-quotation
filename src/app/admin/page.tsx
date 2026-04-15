"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { configProvider } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { ADMIN_SESSION_KEY, ADMIN_CONFIG_KEY, ADMIN_DEFAULT_CONFIG_KEY } from "@/lib/config/storageKeys";

/**
 * 관리자 페이지: 원가·마진률 확인 및 수정 (마인드맵 기준)
 * PIN 로그인 후 접근. 수정한 설정은 localStorage에 저장되어 견적 페이지에 반영됨.
 */
export default function AdminPage() {
  const router = useRouter();
  const [editing, setEditing] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const session = typeof window !== "undefined" ? localStorage.getItem(ADMIN_SESSION_KEY) : null;
    if (session !== "1") {
      if (typeof window !== "undefined") {
        alert("로그인 PIN을 입력하세요.");
      }
      router.replace("/");
      return;
    }
    configProvider.getAllConfig().then((c) => {
      setEditing(JSON.parse(JSON.stringify(c)));
    });
  }, [mounted, router]);

  const handleSave = async () => {
    if (!editing || typeof window === "undefined") return;
    try {
      const pin = editing.settings.loginPin ?? "";
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, config: editing }),
      });
      if (res.status === 401) {
        alert("PIN이 일치하지 않습니다. 현재 설정된 로그인 PIN을 입력한 상태에서 저장해 주세요.");
        return;
      }
      if (!res.ok && res.status !== 503) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "저장 실패");
      }
      localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(editing));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "저장 중 오류가 났습니다.");
    }
  };

  const handleSaveAsDefault = () => {
    if (!editing || typeof window === "undefined") return;
    if (!confirm("지금 설정된 값을 '기본값'으로 저장합니다. 나중에 '기본값 복원' 시 이 값으로 돌아갑니다. 진행할까요?")) return;
    try {
      localStorage.setItem(ADMIN_DEFAULT_CONFIG_KEY, JSON.stringify(editing));
      setDefaultSaved(true);
      setTimeout(() => setDefaultSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetToDefault = () => {
    if (typeof window === "undefined") return;
    if (!confirm("저장된 설정을 지우고 기본 설정으로 되돌릴까요? (기본값으로 저장해 둔 게 있으면 그 값으로, 없으면 코드 기본값으로 복원됩니다.)")) return;
    configProvider.getDefaultConfig().then((c) => {
      try {
        localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(c));
      } catch {
        // ignore
      }
      setEditing(JSON.parse(JSON.stringify(c)));
    });
  };

  const updateSettings = <K extends keyof AppConfig["settings"]>(
    key: K,
    value: AppConfig["settings"][K]
  ) => {
    if (!editing) return;
    setEditing({
      ...editing,
      settings: { ...editing.settings, [key]: value },
    });
  };

  const updateStickerRate = (material: string, size: "a4" | "a3", value: number) => {
    if (!editing) return;
    const next = { ...editing.stickerRates };
    if (!next[material]) next[material] = { a4: 0, a3: 0, a3Available: true };
    next[material] = { ...next[material], [size]: value };
    setEditing({ ...editing, stickerRates: next });
  };

  const updateBusinessCardOptionPrice = (optionIndex: number, qty: number, value: number) => {
    if (!editing) return;
    const next = editing.businessCardOptions.map((o, i) =>
      i === optionIndex ? { ...o, prices: { ...o.prices, [qty]: value } } : o
    );
    setEditing({ ...editing, businessCardOptions: next });
  };

  const updateBusinessCardOptionLabel = (optionIndex: number, value: string) => {
    if (!editing) return;
    const next = editing.businessCardOptions.map((o, i) =>
      i === optionIndex ? { ...o, label: value } : o
    );
    setEditing({ ...editing, businessCardOptions: next });
  };

  const updateBusinessCardDesignTierFee = (tierIndex: number, value: number) => {
    if (!editing) return;
    const next = editing.businessCardDesignTiers.map((t, i) =>
      i === tierIndex ? { ...t, fee: value } : t
    );
    setEditing({ ...editing, businessCardDesignTiers: next });
  };

  if (!mounted) return null;
  if (!editing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  const s = editing.settings;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-slate-600 hover:text-slate-800 text-sm">
          ← 첫 화면
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">관리자 · 원가/마진 설정</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSaveAsDefault}
            className="text-sm text-slate-600 hover:text-slate-800 border border-slate-300 px-3 py-2 rounded-lg"
          >
            {defaultSaved ? "기본값 저장됨" : "현재 설정을 기본값으로 저장"}
          </button>
          <button
            type="button"
            onClick={handleResetToDefault}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            기본값 복원
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            {saved ? "저장됨" : "저장"}
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
        {/* 공통 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">공통</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">로그인 PIN</span>
              <input
                type="text"
                value={s.loginPin}
                onChange={(e) => updateSettings("loginPin", e.target.value)}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">VAT율 (0~1)</span>
              <input
                type="number"
                step={0.01}
                value={s.vatRate}
                onChange={(e) => updateSettings("vatRate", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">스티커 시트 기본 간격 (mm)</span>
              <input
                type="number"
                value={s.defaultGapMm}
                onChange={(e) => updateSettings("defaultGapMm", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">스티커 시트 작업비 (원)</span>
              <input
                type="number"
                value={s.workFeeStickerSheet}
                onChange={(e) => updateSettings("workFeeStickerSheet", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">스티커 최소 공급가 (원)</span>
              <input
                type="number"
                value={s.minStickerSupply}
                onChange={(e) => updateSettings("minStickerSupply", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
          </div>
        </section>

        {/* POP 원가/단가 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">POP</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">롤 폭 (mm)</span>
              <input
                type="number"
                value={s.popRollWidthMm}
                onChange={(e) => updateSettings("popRollWidthMm", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">4-cut 판매 단가 (원/m)</span>
              <input
                type="number"
                value={s.popSellPerM4}
                onChange={(e) => updateSettings("popSellPerM4", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">2-cut 판매 단가 (원/m)</span>
              <input
                type="number"
                value={s.popSellPerM2}
                onChange={(e) => updateSettings("popSellPerM2", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
          </div>
        </section>

        {/* 스티커 시트 (재질별 단가) */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">스티커 시트 (재질별 판매 단가 원/매)</h2>
          <div className="space-y-2 text-sm">
            {Object.keys(editing.stickerRates).map((mat) => (
              <div key={mat} className="flex flex-wrap items-center gap-2">
                <span className="w-24 font-medium">{mat}</span>
                <input
                  type="number"
                  placeholder="A4"
                  value={editing.stickerRates[mat]?.a4 ?? ""}
                  onChange={(e) => updateStickerRate(mat, "a4", Number(e.target.value))}
                  className="w-24 border rounded px-2 py-1"
                />
                <span className="text-slate-400">A4</span>
                <input
                  type="number"
                  placeholder="A3"
                  value={editing.stickerRates[mat]?.a3 ?? ""}
                  onChange={(e) => updateStickerRate(mat, "a3", Number(e.target.value))}
                  className="w-24 border rounded px-2 py-1"
                />
                <span className="text-slate-400">A3</span>
              </div>
            ))}
          </div>
        </section>

        {/* 솔벤트 스티커 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">솔벤트 스티커</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">롤 폭 (mm)</span>
              <input
                type="number"
                value={s.solventRollWidthMm}
                onChange={(e) => updateSettings("solventRollWidthMm", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">작업비 (원)</span>
              <input
                type="number"
                value={s.workFeeSolvent}
                onChange={(e) => updateSettings("workFeeSolvent", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
          </div>
        </section>

        {/* DTF */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">DTF</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">판매 단가 (원/m)</span>
              <input
                type="number"
                value={s.dtfSellPerM}
                onChange={(e) => updateSettings("dtfSellPerM", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">참고 원가 (원/m)</span>
              <input
                type="number"
                value={s.dtfCostPerM}
                onChange={(e) => updateSettings("dtfCostPerM", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">1m당 예상 시간 (분)</span>
              <input
                type="number"
                value={s.dtfMinutesPerM}
                onChange={(e) => updateSettings("dtfMinutesPerM", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">롤 폭 (mm, 기본 850 = 85cm)</span>
              <input
                type="number"
                value={s.dtfRollWidthMm}
                onChange={(e) => updateSettings("dtfRollWidthMm", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">출력물 간 간격 (mm)</span>
              <input
                type="number"
                value={s.dtfGapMm}
                onChange={(e) => updateSettings("dtfGapMm", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
          </div>
        </section>

        {/* 명함 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">명함</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">용지 옵션별 매수·금액 (원)</p>
              {editing.businessCardOptions.map((o, optIdx) => (
                <div key={o.id} className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <label className="flex flex-col gap-1 mb-2">
                    <span className="text-xs text-slate-500">옵션 이름</span>
                    <input
                      type="text"
                      value={o.label}
                      onChange={(e) => updateBusinessCardOptionLabel(optIdx, e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1 text-sm"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(o.prices)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([qty, price]) => (
                        <label key={qty} className="flex items-center gap-1">
                          <span className="text-xs text-slate-600 w-10">{qty}매</span>
                          <input
                            type="number"
                            value={price}
                            onChange={(e) =>
                              updateBusinessCardOptionPrice(optIdx, Number(qty), Number(e.target.value))
                            }
                            className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-slate-400">원</span>
                        </label>
                      ))}
                  </div>
                  {o.note && <p className="text-xs text-slate-400 mt-1">{o.note}</p>}
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">디자인 등급별 수수료 (원)</p>
              <div className="flex flex-wrap gap-3">
                {editing.businessCardDesignTiers.map((t, tierIdx) => (
                  <label key={t.id} className="flex flex-col gap-1">
                    <span className="text-xs text-slate-600">{t.label}</span>
                    <input
                      type="number"
                      value={t.fee}
                      onChange={(e) => updateBusinessCardDesignTierFee(tierIdx, Number(e.target.value))}
                      className="w-28 border border-slate-300 rounded px-2 py-1 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 배너 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">배너</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">1장 기본가 (원)</span>
              <input
                type="number"
                value={s.bannerBasePrice}
                onChange={(e) => updateSettings("bannerBasePrice", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">거치대 실내 (원)</span>
              <input
                type="number"
                value={s.bannerStandIndoor}
                onChange={(e) => updateSettings("bannerStandIndoor", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">거치대 야외 (원)</span>
              <input
                type="number"
                value={s.bannerStandOutdoor}
                onChange={(e) => updateSettings("bannerStandOutdoor", Number(e.target.value))}
                className="border border-slate-300 rounded px-2 py-1"
              />
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}
