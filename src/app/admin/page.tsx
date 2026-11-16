"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { configProvider } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { ADMIN_DEFAULT_CONFIG_KEY } from "@/lib/config/storageKeys";
import { toPublicConfig } from "@/lib/config/publicConfig";
import { CostWorkspace, type CostTab } from "@/components/admin/CostWorkspace";

interface AppliedConfigInfo {
  source: "server" | "default";
  revision: number;
  updatedAt: string | null;
}

interface SaveResult {
  ok: boolean;
  text: string;
}

/**
 * 관리자 페이지. 판매가격은 기존 화면이고, 원가·공정·수익성은 별도 메뉴다.
 * 로그인 세션은 서버 쿠키로 확인하고, 견적 설정은 서버 저장이 성공한 뒤에만 반영한다.
 */
const ADMIN_TABS: { id: CostTab | "sale"; label: string }[] = [
  { id: "materials", label: "1. 원자재 관리" },
  { id: "processes", label: "2. 제작 공정 관리" },
  { id: "products", label: "3. 판매 품목 관리" },
  { id: "quote", label: "4. 견적 작성" },
  { id: "history", label: "5. 견적 기록" },
];

export default function AdminPage() {
  const router = useRouter();
  const [editing, setEditing] = useState<AppConfig | null>(null);
  const [applied, setApplied] = useState<AppliedConfigInfo | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [tab, setTab] = useState<CostTab | "sale">("materials");
  const [costDraft, setCostDraft] = useState({ dirty: false, source: "" });
  const onCostDraft = useCallback((state: { dirty: boolean; source: string }) => setCostDraft(state), []);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [staffNote, setStaffNote] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [blocked, setBlocked] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    void (async () => {
      const session = await fetch("/api/admin/session");
      if (!session.ok) {
        alert("로그인 PIN을 입력하세요.");
        router.replace("/");
        return;
      }
      const sessionBody = (await session.json()) as { role?: string };
      if (sessionBody.role === "staff") {
        if (!cancelled) setBlocked("직원 권한으로는 원자재, 공정, 판매 설정을 바꿀 수 없습니다.");
        return;
      }
      const staff = await fetch("/api/admin/staff-pin");
      if (staff.ok) {
        const staffBody = (await staff.json()) as { configured?: boolean };
        if (!cancelled) setStaffNote(staffBody.configured ? "직원 PIN이 저장되어 있습니다. 값은 표시하지 않습니다." : "직원 PIN이 아직 없습니다. 관리자가 직접 입력해 저장하면 견적 전용 로그인이 분리됩니다.");
      }
      const res = await fetch("/api/admin/config");
      if (!res.ok) {
        alert("관리자 설정을 불러오지 못했습니다.");
        router.replace("/");
        return;
      }
      const data = (await res.json()) as {
        config: AppConfig;
        source: "server" | "default";
        revision: number;
        updatedAt: string | null;
      };
      if (cancelled) return;
      setEditing(data.config);
      setApplied({ source: data.source, revision: data.revision, updatedAt: data.updatedAt });
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, router]);

  const handleSave = async () => {
    if (!editing || typeof window === "undefined") return;
    setSaveResult(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: editing }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        revision?: number;
        updatedAt?: string | null;
        publicConfig?: AppConfig;
      };
      if (!res.ok) {
        const reason =
          res.status === 401
            ? "로그인이 필요합니다."
            : "서버에 저장하지 못했습니다. 이 브라우저에는 저장하지 않았고, 견적에는 반영되지 않습니다.";
        setSaveResult({ ok: false, text: reason });
        alert(reason);
        return;
      }
      if (data.publicConfig) {
        configProvider.rememberServerConfig(data.publicConfig);
      }
      setApplied({
        source: "server",
        revision: data.revision ?? 0,
        updatedAt: data.updatedAt ?? null,
      });
      setSaveResult({ ok: true, text: `서버 저장 성공 (버전 ${data.revision ?? 0})` });
    } catch {
      const reason = "서버에 저장하지 못했습니다. 이 브라우저에는 저장하지 않았고, 견적에는 반영되지 않습니다.";
      setSaveResult({ ok: false, text: reason });
      alert(reason);
    }
  };

  const handleSaveAsDefault = () => {
    if (!editing || typeof window === "undefined") return;
    if (!confirm("이 브라우저의 복원 템플릿으로만 저장합니다. 견적에 쓰는 서버 설정은 바뀌지 않습니다. 진행할까요?")) return;
    try {
      localStorage.setItem(ADMIN_DEFAULT_CONFIG_KEY, JSON.stringify(toPublicConfig(editing)));
      setDefaultSaved(true);
      setTimeout(() => setDefaultSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetToDefault = () => {
    if (!editing || typeof window === "undefined") return;
    if (!confirm("서버에 저장된 견적 설정을 복원 템플릿으로 되돌립니다. 서버 저장이 성공해야 적용됩니다.")) return;
    void (async () => {
      const base = await configProvider.getDefaultConfig();
      const next: AppConfig = {
        ...base,
        settings: { ...base.settings, loginPin: editing.settings.loginPin ?? "" },
      };
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        revision?: number;
        updatedAt?: string | null;
        publicConfig?: AppConfig;
      };
      if (!res.ok) {
        const reason = "서버에 복원하지 못했습니다. 이 브라우저에는 저장하지 않았습니다.";
        setSaveResult({ ok: false, text: reason });
        alert(reason);
        return;
      }
      if (data.publicConfig) {
        configProvider.rememberServerConfig(data.publicConfig);
        setEditing({
          ...data.publicConfig,
          settings: { ...data.publicConfig.settings, loginPin: editing.settings.loginPin ?? "" },
        });
      } else {
        setEditing(next);
      }
      setApplied({
        source: "server",
        revision: data.revision ?? 0,
        updatedAt: data.updatedAt ?? null,
      });
      setSaveResult({ ok: true, text: `서버에 기본값을 복원했습니다 (버전 ${data.revision ?? 0})` });
    })();
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

  const saveStaffPin = async () => {
    const res = await fetch("/api/admin/staff-pin", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: staffPin }),
    });
    if (!res.ok) {
      setStaffNote("직원 PIN을 저장하지 못했습니다. 4자리부터 8자리 숫자만 저장합니다.");
      return;
    }
    setStaffPin("");
    setStaffNote("직원 PIN을 저장했습니다. 그 PIN은 견적 계산과 저장만 할 수 있고, 원가는 바꿀 수 없습니다.");
  };

  if (blocked) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-lg rounded-2xl bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">관리자 설정</h1>
          <p className="mt-2 text-sm text-slate-700">{blocked}</p>
          <a className="mt-4 inline-block font-medium text-blue-700" href="/quotes">견적 기록으로 이동</a>
        </div>
      </main>
    );
  }

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
        <Link
          href="/"
          className="text-slate-600 hover:text-slate-800 text-sm"
          onClick={(event) => {
            if (!costDraft.dirty) return;
            const leave = window.confirm("서버에 저장하지 않은 원가가 있습니다. 견적 화면으로 이동할까요?");
            if (!leave) event.preventDefault();
          }}
        >
          ← 견적 화면
        </Link>
        <h1 className="text-xl font-semibold text-slate-800">관리자</h1>
        <div className="hidden">
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
            저장
          </button>
        </div>
      </header>
      <nav className="bg-white border-b border-slate-200 px-4 py-2 flex gap-2 overflow-x-auto">
        {ADMIN_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (costDraft.dirty && item.id !== tab && (item.id === "sale" || tab === "sale")) {
                const leave = window.confirm("저장하지 않은 원가 변경이 있습니다. 판매가격 화면과 원가 화면을 오가도 고객 판매가는 바뀌지 않습니다. 이동할까요?");
                if (!leave) return;
              }
              setTab(item.id);
            }}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap ${
              tab === item.id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <p className="hidden">
        {applied
          ? `적용 중: ${applied.source === "server" ? "서버 설정" : "코드 기본값"} · 버전 ${applied.revision}${
              applied.updatedAt ? ` · ${applied.updatedAt}` : ""
            }`
          : "설정을 불러오는 중입니다."}
        {saveResult ? ` · 마지막 저장: ${saveResult.text}` : ""}
      </p>
      <section className="mx-auto max-w-3xl px-4 pt-4">
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">직원 PIN</summary>
          <p className="mt-2 text-sm text-slate-600">{staffNote || "직원 PIN 상태를 확인하는 중입니다."}</p>
          <p className="mt-1 text-xs text-slate-500">기존 관리자 PIN은 그대로 전체 권한을 유지합니다. 새 PIN은 여기에 직접 입력할 때만 저장됩니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="rounded-lg border border-slate-300 px-3 py-2" inputMode="numeric" type="password" placeholder="4~8자리" value={staffPin} onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <button type="button" className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white" onClick={() => void saveStaffPin()}>직원 PIN 저장</button>
          </div>
        </details>
      </section>
      <CostWorkspace tab={tab} onDraftState={onCostDraft} />
      <details className={`max-w-3xl mx-auto px-4 pb-10 ${tab === "products" ? "" : "hidden"}`}>
        <summary className="cursor-pointer py-3 text-sm text-slate-700">기존 고객 8개 화면 가격. 새 견적으로 바꾸기 전까지 고객 화면용으로만 둡니다. 새 추천가와 맞추지 않습니다.</summary>
        <p className="text-xs text-slate-600 pb-2">
          {applied
            ? `적용 중: ${applied.source === "server" ? "서버 설정" : "코드 기본값"} · 버전 ${applied.revision}${
                applied.updatedAt ? ` · ${applied.updatedAt}` : ""
              }`
            : "설정을 불러오는 중입니다."}
          {saveResult ? ` · 마지막 저장: ${saveResult.text}` : ""}
        </p>
        <div className="flex items-center gap-2 flex-wrap pb-3">
          <button type="button" onClick={handleSaveAsDefault} className="text-sm text-slate-600 border border-slate-300 px-3 py-2 rounded-lg">
            {defaultSaved ? "기본값 저장됨" : "현재 설정을 기본값으로 저장"}
          </button>
          <button type="button" onClick={handleResetToDefault} className="text-sm text-slate-500">기본값 복원</button>
          <button type="button" onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">기존 고객 가격만 저장</button>
        </div>
      <main className="max-w-3xl mx-auto space-y-8">
        {/* 공통 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">공통</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">로그인 PIN</span>
              <input
                type="text"
                value={s.loginPin ?? ""}
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
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">판매 단가 (원/m)</span>
              <input
                type="number"
                value={s.solventSellPerM ?? s.popSellPerM4}
                onChange={(e) => updateSettings("solventSellPerM", Number(e.target.value))}
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
      </details>
    </div>
  );
}
