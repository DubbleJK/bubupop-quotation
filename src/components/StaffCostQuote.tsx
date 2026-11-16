"use client";

import { useEffect, useState, type FormEvent } from "react";
import { calcVatAndTotal } from "@/lib/calc/common";
import type { PublicCatalog } from "@/lib/cost/publicCatalog";

interface QuoteLine {
  name: string;
  supplyCost?: number;
  usageQty?: number;
  unitLabel?: string;
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
    warnings: string[];
    supplyCost?: number;
    targetSupplyPrice?: number;
    productMinimumSupply?: number;
    recommendedSupplyPrice?: number;
    vatRate: number;
    lines: QuoteLine[];
    costLibraryRevision: number;
  };
}

function won(value?: number): string {
  return value == null ? "—" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function conditionKey(productId: string, width: string, height: string, qty: string, gap: string, payload: QuotePayload | null): string {
  const result = payload?.result;
  return [productId, width, height, qty, gap, result?.costLibraryRevision ?? "", result?.supplyCost ?? "", result?.recommendedSupplyPrice ?? ""].join("|");
}

export function StaffCostQuote({ productId, onProductChange }: { productId: string; onProductChange: (id: string) => void }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [query, setQuery] = useState("");
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
  const [showLines, setShowLines] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/session").then((res) => setAuthed(res.ok));
    void fetch("/api/catalog").then((res) => res.json()).then((data: { catalog?: PublicCatalog }) => setCatalog(data.catalog ?? null)).catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    setManual(false);
    setManualSpec("");
    setOffered("");
    setConfirmedKey("");
    setSaved("");
    setPayload(null);
  }, [productId]);

  useEffect(() => {
    if (!authed) return;
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
          setAuthed(false);
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
  }, [authed, productId, qty, width, height, gap, manual]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      setLoginError("로그인에 실패했습니다.");
      return;
    }
    setPin("");
    setAuthed(true);
  };

  if (authed === null) return <p className="text-sm text-slate-500">로그인 상태를 확인하는 중입니다.</p>;
  if (!authed) {
    return (
      <form onSubmit={login} className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">직원 로그인</h2>
        <p className="mt-1 text-sm text-slate-500">원가와 추천가는 로그인한 뒤에만 계산합니다.</p>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" placeholder="PIN" />
        {loginError && <p className="mt-2 text-sm text-red-600">{loginError}</p>}
        <button type="submit" className="mt-4 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white">로그인</button>
      </form>
    );
  }

  const result = payload?.result;
  const needsSize = payload?.fields.width !== false;
  const inputsReady = Number(qty) >= 1 && (!needsSize || (Number(width) > 0 && Number(height) > 0));
  const offeredPrice = Number(offered);
  const recommended = result?.recommendedSupplyPrice;
  const key = conditionKey(productId, width, height, qty, gap, payload);
  const specKey = [productId, width, height, qty, gap].join("|");
  const priceOnly = manual && manualSpec === specKey && confirmedKey !== key;
  const specStale = manual && manualSpec !== specKey;
  const priceOk = recommended != null && (offeredPrice === recommended || (manual && confirmedKey === key && !specStale));
  const minimumApplied = result?.productMinimumSupply != null && recommended === result.productMinimumSupply && (result.targetSupplyPrice ?? 0) < result.productMinimumSupply;
  const chooseProduct = (nextId: string) => {
    if (nextId === productId) return;
    if (payload || manual || offered) {
      const ok = window.confirm("상품을 바꾸면 이전 상품의 공급가는 적용하지 않습니다. 새 상품의 원가와 추천가로 다시 계산합니다.");
      if (!ok) return;
    }
    onProductChange(nextId);
  };
  const canSave = inputsReady && (payload?.stage === "ready" || payload?.stage === "review") && priceOk && result?.missing.length === 0;
  const vat = Number.isFinite(offeredPrice) ? calcVatAndTotal(offeredPrice, result?.vatRate ?? 0.1) : undefined;
  const margin = result?.supplyCost != null && offeredPrice > 0 ? (offeredPrice - result.supplyCost) / offeredPrice : undefined;
  const products = [
    ...(catalog?.groups.flatMap((group) => group.products.map((item) => ({ ...item, group: group.label }))) ?? []),
    ...(catalog?.ungrouped.map((item) => ({ ...item, group: "그룹 없음" })) ?? []),
  ].filter((item) => !item.legacyQuoteId && (query.trim() === "" || item.label.includes(query.trim())));

  const save = async () => {
    if (!result || !canSave) return;
    setSaved("");
    const res = await fetch("/api/admin/quote-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entry: {
          productId,
          input: { widthMm: Number(width) || 0, heightMm: Number(height) || 0, qty: Number(qty) || 0, gapMm: Number(gap) || 0, label: payload?.label ?? productId },
          salePolicyRevision: 0,
          costLibraryRevision: result.costLibraryRevision,
          marginPolicyRevision: 0,
          presentedSupplyPrice: offeredPrice,
          presentedVat: vat?.vat ?? 0,
          presentedTotal: vat?.total ?? 0,
          staffName,
          customerName,
          adjustmentReason: reason,
          priceConfirmed: offeredPrice !== recommended,
          internal: {
            supplyCost: result.supplyCost,
            targetSupplyPrice: result.targetSupplyPrice,
            minimumSupplyPrice: result.productMinimumSupply,
            recommendedSupplyPrice: result.recommendedSupplyPrice,
            marginRate: margin,
            missing: result.missing,
            lines: result.lines,
          },
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setSaved(res.ok ? "이 조건의 견적 금액을 기록했습니다. 나중에 원가가 바뀌어도 이 기록은 바뀌지 않습니다." : (body.message ?? "기록을 저장하지 못했습니다."));
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">견적 입력</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="상품명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="rounded-xl border border-slate-300 px-3 py-3 text-base" value={productId} onChange={(e) => chooseProduct(e.target.value)}>
            {products.map((item) => <option key={item.id} value={item.id}>{item.group} · {item.label}{item.description ? ` · ${item.description}` : ""}</option>)}
            {products.every((item) => item.id !== productId) && <option value={productId}>{payload?.label ?? productId}</option>}
          </select>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {needsSize && <label className="text-sm font-medium text-slate-700">가로(mm)<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={width} onChange={(e) => { setWidth(e.target.value); setConfirmedKey(""); }} /></label>}
          {needsSize && <label className="text-sm font-medium text-slate-700">세로(mm)<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={height} onChange={(e) => { setHeight(e.target.value); setConfirmedKey(""); }} /></label>}
          <label className="text-sm font-medium text-slate-700">수량<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={qty} onChange={(e) => { setQty(e.target.value); setConfirmedKey(""); }} /></label>
          {payload?.fields.gap !== false && <label className="text-sm font-medium text-slate-700">간격(mm)<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" value={gap} onChange={(e) => { setGap(e.target.value); setConfirmedKey(""); }} /></label>}
        </div>
        {!inputsReady && <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">견적을 계산하려면 가로·세로와 수량을 입력하세요.</p>}
        {payload?.stage === "review" && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">현재 출력 공정비는 임시 기준입니다. 주문 기본 작업비 확인이 필요합니다.</p>}
        {payload?.stage === "incomplete" && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">설정이 끝나지 않아 확정 견적으로 저장할 수 없습니다.</p>}
        {inputsReady && payload?.issues.map((issue) => <p key={issue} className="mt-3 text-sm text-amber-800">{issue}</p>)}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
      <aside className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <p className="text-sm font-medium text-slate-500">{payload?.label ?? "견적 결과"} {payload ? `· ${payload.stageLabel}` : ""}</p>
        <p className="mt-2 text-sm text-slate-500">최종 추천 공급가</p>
        <p className="text-4xl font-semibold tracking-tight text-slate-950">{inputsReady ? won(recommended) : "—"}</p>
        {inputsReady && minimumApplied && <p className="mt-1 text-sm font-medium text-blue-800">최소 판매금액을 적용했습니다.</p>}
        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex justify-between gap-3"><dt>총제작원가</dt><dd>{inputsReady ? won(result?.supplyCost) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt>목표 이익률 기준</dt><dd>{inputsReady ? won(result?.targetSupplyPrice) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt>최소 판매금액</dt><dd>{won(result?.productMinimumSupply)}</dd></div>
        </dl>
        <label className="mt-4 block text-sm font-medium text-slate-800">실제 공급가 (VAT 별도)
          <input className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-2xl text-slate-900" inputMode="numeric" value={offered ? Number(offered).toLocaleString("ko-KR") : ""} onChange={(e) => { setOffered(e.target.value.replace(/[^\d]/g, "")); setManual(true); setManualSpec(specKey); setConfirmedKey(""); }} />
        </label>
        {priceOnly && (
          <p className="mt-2 text-sm text-amber-800">변경한 공급가를 확인해 주세요. {won(offeredPrice)} · 예상 이익률 {margin == null ? "—" : `${(margin * 100).toFixed(1)}%`}</p>
        )}
        {specStale && <p className="mt-2 text-sm text-amber-800">규격이나 수량이 바뀌었습니다. 새 원가 {won(result?.supplyCost)}, 새 추천가 {won(recommended)}. 확인하기 전에는 저장할 수 없습니다.</p>}
        {(priceOnly || specStale) && (
          <button type="button" className="mt-2 text-sm font-medium text-blue-700" onClick={() => { setManual(false); setManualSpec(""); setOffered(String(recommended ?? "")); setConfirmedKey(""); }}>새 추천가로 맞추기</button>
        )}
        {manual && offeredPrice !== recommended && !specStale && (
          <button type="button" className="mt-2 block text-sm font-medium text-blue-700" onClick={() => { setConfirmedKey(key); setManualSpec(specKey); }}>이 금액으로 확인</button>
        )}
        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex justify-between gap-3"><dt>예상 이익률</dt><dd>{margin == null ? "—" : `${(margin * 100).toFixed(1)}%`}</dd></div>
          <div className="flex justify-between gap-3"><dt>부가세</dt><dd>{won(vat?.vat)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base font-semibold text-slate-950"><dt>안내 결제금액 (VAT 포함)</dt><dd>{won(vat?.total)}</dd></div>
        </dl>
        {margin != null && margin < 0.2 && <p className="mt-2 text-sm text-amber-800">최소 확보 이익률 20%보다 낮습니다.</p>}
        {result?.productMinimumSupply != null && offeredPrice > 0 && offeredPrice < result.productMinimumSupply && <p className="mt-2 text-sm text-amber-800">최소 판매금액보다 낮습니다.</p>}
        <div className="mt-4 space-y-2">
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="담당자" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="거래처 (선택)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="가격 조정 사유" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="button" disabled={!canSave} className="mt-4 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white disabled:bg-slate-300" onClick={() => void save()}>이 금액으로 기록</button>
        {saved && <p className="mt-2 text-sm text-slate-600">{saved}</p>}
        {inputsReady && (result?.lines.length ?? 0) > 0 && (
          <div className="mt-4">
            <button type="button" className="text-sm text-slate-500" onClick={() => setShowLines((value) => !value)}>{showLines ? "원가 상세 접기" : "원가 상세 보기"}</button>
            {showLines && result?.lines.map((line) => <p key={line.name} className="mt-1 text-xs text-slate-500">{line.name} {won(line.supplyCost)} {line.reason ?? ""}</p>)}
          </div>
        )}
      </aside>
    </div>
  );
}
