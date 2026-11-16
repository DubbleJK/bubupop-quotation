"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { calcVatAndTotal } from "@/lib/calc/common";

interface QuoteLine {
  name: string;
  kind?: string;
  supplyCost?: number;
  reason?: string;
}

interface QuotePayload {
  label: string;
  stage: "ready" | "review" | "incomplete" | "hidden";
  stageLabel: string;
  issues: string[];
  fields: { width: boolean; height: boolean; gap: boolean };
  result: {
    missing: string[];
    warnings?: string[];
    supplyCost?: number;
    targetRate?: number;
    targetSupplyPrice?: number;
    productMinimumSupply?: number;
    recommendedSupplyPrice?: number;
    minimumApplied?: boolean;
    vatRate: number;
    lines?: QuoteLine[];
    costLibraryRevision?: number;
  };
}

interface Draft {
  productId: string;
  width: string;
  height: string;
  qty: string;
  gap: string;
  offered: string;
  manual: boolean;
  staffName: string;
  customerName: string;
  reason: string;
}

const DRAFT_KEY = "quotation_cost_draft";

function won(value?: number): string {
  return value == null ? "—" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return parsed && typeof parsed.productId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function StaffCostQuote({
  productId,
  role,
  active,
  restoreReady,
  resetToken,
  onRole,
  onCleanChange,
  onNewQuote,
  children,
}: {
  productId: string;
  role: "admin" | "staff" | null;
  active: boolean;
  restoreReady: boolean;
  resetToken: number;
  onRole: (role: "admin" | "staff" | null) => void;
  onCleanChange: (clean: boolean) => void;
  onNewQuote: () => void;
  children: (view: { fields: ReactNode; result: ReactNode; confirmSwitch: () => boolean; clean: boolean }) => ReactNode;
}) {
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [qty, setQty] = useState("1");
  const [gap, setGap] = useState("5");
  const [payload, setPayload] = useState<QuotePayload | null>(null);
  const [error, setError] = useState("");
  const [offered, setOffered] = useState("");
  const [manual, setManual] = useState(false);
  const [manualSpec, setManualSpec] = useState("");
  const [confirmedKey, setConfirmedKey] = useState("");
  const [staffName, setStaffName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState("");
  const [clean, setClean] = useState(true);
  const restored = useRef(false);

  useEffect(() => {
    onCleanChange(clean);
  }, [clean, onCleanChange]);
  const seenProduct = useRef<string | null>(null);

  useEffect(() => {
    if (!restoreReady || restored.current) return;
    restored.current = true;
    const draft = readDraft();
    if (!draft || draft.productId !== productId) return;
    setWidth(draft.width ?? "");
    setHeight(draft.height ?? "");
    setQty(draft.qty || "1");
    setGap(draft.gap || "5");
    setOffered(draft.offered ?? "");
    setManual(Boolean(draft.manual));
    setManualSpec([draft.productId, draft.width ?? "", draft.height ?? "", draft.qty || "1", draft.gap || "5"].join("|"));
    setStaffName(draft.staffName ?? "");
    setCustomerName(draft.customerName ?? "");
    setReason(draft.reason ?? "");
    setClean(false);
  }, [restoreReady, productId]);

  useEffect(() => {
    if (!active) return;
    const draft: Draft = { productId, width, height, qty, gap, offered, manual, staffName, customerName, reason };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [active, productId, width, height, qty, gap, offered, manual, staffName, customerName, reason]);

  useEffect(() => {
    if (!restoreReady) return;
    if (seenProduct.current === null) {
      seenProduct.current = productId;
      return;
    }
    if (seenProduct.current === productId) return;
    seenProduct.current = productId;
    setManual(false);
    setManualSpec("");
    setOffered("");
    setConfirmedKey("");
    setSaved("");
    setPayload(null);
  }, [productId, restoreReady]);

  useEffect(() => {
    if (resetToken === 0) return;
    setWidth("");
    setHeight("");
    setQty("1");
    setGap("5");
    setOffered("");
    setManual(false);
    setManualSpec("");
    setConfirmedKey("");
    setStaffName("");
    setCustomerName("");
    setReason("");
    setSaved("");
    setPayload(null);
    setClean(true);
  }, [resetToken]);

  useEffect(() => {
    if (!active || !role) return;
    const handle = window.setTimeout(() => {
      void fetch("/api/quote/calculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: {
            productId,
            qty: Number(qty) || 0,
            widthMm: width ? Number(width) : undefined,
            heightMm: height ? Number(height) : undefined,
            gapMm: gap ? Number(gap) : undefined,
          },
        }),
      }).then(async (res) => {
        if (res.status === 401) {
          onRole(null);
          return;
        }
        const data = (await res.json()) as QuotePayload & { error?: string };
        if (!res.ok) {
          setError("견적을 계산하지 못했습니다.");
          return;
        }
        setError("");
        setPayload(data);
        setOffered((current) => manual ? current : String(data.result.recommendedSupplyPrice ?? ""));
      }).catch(() => setError("견적을 계산하지 못했습니다."));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [active, role, productId, qty, width, height, gap, manual, onRole]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await res.json().catch(() => ({}))) as { role?: string };
    if (!res.ok) {
      setLoginError("로그인에 실패했습니다.");
      return;
    }
    setPin("");
    setLoginError("");
    onRole(data.role === "staff" ? "staff" : "admin");
  };

  const result = payload?.result;
  const needsSize = payload?.fields.width !== false;
  const inputsReady = Number(qty) >= 1 && (!needsSize || (Number(width) > 0 && Number(height) > 0));
  const offeredPrice = Number(offered);
  const recommended = result?.recommendedSupplyPrice;
  const specKey = [productId, width, height, qty, gap].join("|");
  const key = [specKey, recommended ?? ""].join("|");
  const priceOnly = manual && manualSpec === specKey && confirmedKey !== key;
  const specStale = manual && manualSpec !== specKey;
  const priceOk = recommended != null && (offeredPrice === recommended || (manual && confirmedKey === key && !specStale));
  const floor = result?.productMinimumSupply;
  const minimumApplied = recommended != null && floor != null && recommended === floor && (result?.targetSupplyPrice == null || result.targetSupplyPrice < floor);
  const vat = Number.isFinite(offeredPrice) ? calcVatAndTotal(offeredPrice, result?.vatRate ?? 0.1) : undefined;
  const margin = result?.supplyCost != null && offeredPrice > 0 ? (offeredPrice - result.supplyCost) / offeredPrice : undefined;
  const admin = role === "admin";
  const canSave = Boolean(role) && inputsReady && (payload?.stage === "ready" || payload?.stage === "review") && priceOk && (result?.missing.length ?? 0) === 0;

  const save = async () => {
    if (!result || !canSave || recommended == null) return;
    setSaved("");
    const res = await fetch("/api/admin/quote-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entry: {
          productId,
          input: { widthMm: Number(width) || 0, heightMm: Number(height) || 0, qty: Number(qty) || 0, gapMm: Number(gap) || 0, label: payload?.label ?? productId },
          salePolicyRevision: 0,
          costLibraryRevision: result.costLibraryRevision ?? 0,
          marginPolicyRevision: 0,
          presentedSupplyPrice: offeredPrice,
          presentedVat: vat?.vat ?? 0,
          presentedTotal: vat?.total ?? 0,
          staffName,
          customerName,
          adjustmentReason: reason,
          priceConfirmed: offeredPrice !== recommended,
          internal: { recommendedSupplyPrice: recommended, missing: result.missing },
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.ok) {
      setSaved("이 조건의 견적 금액을 기록했습니다. 나중에 원가가 바뀌어도 이 기록은 바뀌지 않습니다.");
      setClean(true);
      return;
    }
    setSaved(body.message ?? "기록을 저장하지 못했습니다.");
  };

  const touch = () => setClean(false);
  const fields = active ? (
    <div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {needsSize && <label className="text-sm font-medium text-slate-700">가로 (mm)<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={width} onChange={(e) => { setWidth(e.target.value); setConfirmedKey(""); touch(); }} /></label>}
        {needsSize && <label className="text-sm font-medium text-slate-700">세로 (mm)<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={height} onChange={(e) => { setHeight(e.target.value); setConfirmedKey(""); touch(); }} /></label>}
        <label className="text-sm font-medium text-slate-700">수량<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={qty} onChange={(e) => { setQty(e.target.value); setConfirmedKey(""); touch(); }} /></label>
        {payload?.fields.gap !== false && <label className="text-sm font-medium text-slate-700">배치 간격 (mm)<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={gap} onChange={(e) => { setGap(e.target.value); setConfirmedKey(""); touch(); }} /></label>}
      </div>
      {!inputsReady && <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">견적을 계산하려면 가로·세로와 수량을 입력하세요.</p>}
      {payload?.stage === "review" && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">{admin ? "현재 출력 공정비는 임시 기준입니다. 주문 기본 작업비 확인이 필요합니다." : "이 품목은 아직 검증 중입니다."}</p>}
      {payload?.stage === "incomplete" && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">설정이 끝나지 않아 확정 견적으로 저장할 수 없습니다.</p>}
      {admin && inputsReady && payload?.issues.map((issue) => <p key={issue} className="mt-3 text-sm text-amber-800">{issue}</p>)}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <a href="#quote-result" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-blue-700 lg:hidden">추천가 보기</a>
    </div>
  ) : null;

  const resultPanel = !active ? null : role == null ? (
    <form id="quote-result" onSubmit={login} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">견적 로그인</h2>
      <p className="mt-1 text-sm text-slate-500">직원 PIN은 견적만 열리고, 관리자 PIN은 원가 분석도 열립니다.</p>
      <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" placeholder="PIN" />
      {loginError && <p className="mt-2 text-sm text-red-600">{loginError}</p>}
      <button type="submit" className="mt-4 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white">로그인</button>
    </form>
  ) : (
    <aside id="quote-result" className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <p className="text-sm font-medium text-slate-500">{payload?.label ?? "견적 결과"} {payload ? `· ${payload.stageLabel}` : ""}</p>
      <p className="mt-2 text-sm text-slate-500">최종 추천 공급가 (VAT 별도)</p>
      <p className="text-4xl font-semibold tracking-tight text-slate-950">{inputsReady ? won(recommended) : "—"}</p>
      {inputsReady && minimumApplied && <p className="mt-1 text-sm font-medium text-blue-800">최소 판매 기준을 적용했습니다.</p>}
      <label className="mt-4 block text-sm font-medium text-slate-800">실제 공급가 (VAT 별도)
        <input className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-2xl text-slate-900" inputMode="numeric" value={offered ? Number(offered).toLocaleString("ko-KR") : ""} onChange={(e) => { setOffered(e.target.value.replace(/[^\d]/g, "")); setManual(true); setManualSpec(specKey); setConfirmedKey(""); touch(); }} />
      </label>
      {priceOnly && <p className="mt-2 text-sm text-amber-800">변경한 공급가를 확인해 주세요. {won(offeredPrice)}</p>}
      {specStale && <p className="mt-2 text-sm text-amber-800">규격이나 수량이 바뀌었습니다. 새 추천가 {won(recommended)}. 확인하기 전에는 저장할 수 없습니다.</p>}
      {(priceOnly || specStale) && <button type="button" className="mt-2 text-sm font-medium text-blue-700" onClick={() => { setManual(false); setManualSpec(""); setOffered(String(recommended ?? "")); setConfirmedKey(""); }}>새 추천가로 맞추기</button>}
      {manual && offeredPrice !== recommended && !specStale && <button type="button" className="mt-2 block text-sm font-medium text-blue-700" onClick={() => { setConfirmedKey(key); setManualSpec(specKey); }}>이 금액으로 확인</button>}
      <dl className="mt-4 space-y-2 text-sm text-slate-700">
        <div className="flex justify-between gap-3"><dt>부가세</dt><dd>{won(vat?.vat)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base font-semibold text-slate-950"><dt>안내 결제금액 (VAT 포함)</dt><dd>{won(vat?.total)}</dd></div>
      </dl>
      {floor != null && offeredPrice > 0 && offeredPrice < floor && <p className="mt-2 text-sm text-amber-800">최소 판매 기준보다 낮은 금액입니다. 관리자 확인이 필요합니다.</p>}
      <div className="mt-4 space-y-2">
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="담당자" value={staffName} onChange={(e) => { setStaffName(e.target.value); touch(); }} />
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="거래처 (선택)" value={customerName} onChange={(e) => { setCustomerName(e.target.value); touch(); }} />
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="가격 조정 사유" value={reason} onChange={(e) => { setReason(e.target.value); touch(); }} />
      </div>
      <button type="button" disabled={!canSave} className="mt-4 min-h-12 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white disabled:bg-slate-300" onClick={() => void save()}>이 금액으로 기록</button>
      {saved && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-slate-600">{saved}</p>
          <button type="button" className="block font-medium text-blue-700" onClick={onNewQuote}>같은 품목으로 새 견적</button>
          <button type="button" className="block font-medium text-blue-700" onClick={() => document.getElementById("product-search")?.focus()}>다른 품목 견적</button>
          <a className="block font-medium text-blue-700" href="/quotes">저장된 견적 보기</a>
        </div>
      )}
      {admin && inputsReady && result?.supplyCost != null && (
        <details className="mt-4 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">원가 분석 보기</summary>
          <dl className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex justify-between gap-3"><dt>총제작원가</dt><dd>{won(result.supplyCost)}</dd></div>
            <div className="flex justify-between gap-3"><dt>목표 이익률</dt><dd>{result.targetRate == null ? "—" : `${Math.round(result.targetRate * 1000) / 10}%`}</dd></div>
            <div className="flex justify-between gap-3"><dt>목표 이익률 기준</dt><dd>{won(result.targetSupplyPrice)}</dd></div>
            <div className="flex justify-between gap-3"><dt>최소 판매금액</dt><dd>{won(result.productMinimumSupply)}</dd></div>
            <div className="flex justify-between gap-3"><dt>예상 이익률</dt><dd>{margin == null ? "—" : `${(margin * 100).toFixed(1)}%`}</dd></div>
          </dl>
          {(result.lines ?? []).filter((line) => line.kind === "material").map((line) => <p key={`m-${line.name}`} className="mt-2 text-xs text-slate-500">원자재 · {line.name} {won(line.supplyCost)}</p>)}
          {(result.lines ?? []).filter((line) => line.kind !== "material").map((line) => <p key={`p-${line.name}`} className="mt-1 text-xs text-slate-500">공정 · {line.name} {won(line.supplyCost)} {line.reason ?? ""}</p>)}
          {margin != null && margin < 0.2 && <p className="mt-2 text-sm text-amber-800">최소 확보 이익률 20%보다 낮습니다.</p>}
          <p className="mt-2 text-xs text-slate-500">추천 공급가는 총제작원가를 목표 이익률로 나눈 값과 최소 판매금액 중 큰 값입니다.</p>
        </details>
      )}
    </aside>
  );

  return children({
    fields,
    result: resultPanel,
    clean,
    confirmSwitch: () => !manual || window.confirm("규격·수량·간격은 유지되고, 이전 공급가는 초기화됩니다."),
  });
}
