"use client";

import { useEffect, useState, type FormEvent } from "react";
import { calcVatAndTotal } from "@/lib/calc/common";

interface QuoteLine {
  name: string;
  supplyCost?: number;
  usageQty?: number;
  unitLabel?: string;
  reason?: string;
  usageNote?: string;
}

interface QuotePayload {
  label: string;
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

export function StaffCostQuote({ productId }: { productId: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [qty, setQty] = useState("1");
  const [gap, setGap] = useState("5");
  const [payload, setPayload] = useState<QuotePayload | null>(null);
  const [error, setError] = useState("");
  const [offered, setOffered] = useState("");
  const [staffName, setStaffName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void fetch("/api/admin/session").then((res) => setAuthed(res.ok));
  }, []);

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
        if (offered === "" && data.result.recommendedSupplyPrice != null) setOffered(String(data.result.recommendedSupplyPrice));
      }).catch(() => setError("견적을 계산하지 못했습니다."));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [authed, productId, qty, width, height, gap]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
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
      <form onSubmit={login} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 max-w-sm">
        <p className="text-sm text-slate-700">원가 견적은 로그인한 직원만 볼 수 있습니다.</p>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-full border border-slate-300 rounded-lg px-3 py-3 text-lg" placeholder="PIN" />
        {loginError && <p className="text-sm text-red-600">{loginError}</p>}
        <button type="submit" className="w-full bg-slate-800 text-white rounded-lg py-3">로그인</button>
      </form>
    );
  }

  const result = payload?.result;
  const offeredPrice = Number(offered);
  const vat = Number.isFinite(offeredPrice) ? calcVatAndTotal(offeredPrice, result?.vatRate ?? 0.1) : undefined;
  const margin = result?.supplyCost != null && offeredPrice > 0 ? (offeredPrice - result.supplyCost) / offeredPrice : undefined;
  const belowFloor = result?.productMinimumSupply != null && offeredPrice > 0 && offeredPrice < result.productMinimumSupply;
  const belowRate = margin != null && margin < 0.2;

  const save = async () => {
    if (!result || !Number.isFinite(offeredPrice)) return;
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
    setSaved(res.ok ? "이 견적 금액을 기록했습니다. 나중에 원가가 바뀌어도 이 기록은 바뀌지 않습니다." : "기록을 저장하지 못했습니다.");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{payload?.label ?? "견적 입력"}</h2>
        {payload?.issues.map((issue) => <p key={issue} className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{issue}</p>)}
        <div className="grid grid-cols-2 gap-3">
          {payload?.fields.width !== false && <label className="text-sm text-slate-600">가로(mm)<input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-3 text-lg" value={width} onChange={(e) => setWidth(e.target.value)} /></label>}
          {payload?.fields.height !== false && <label className="text-sm text-slate-600">세로(mm)<input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-3 text-lg" value={height} onChange={(e) => setHeight(e.target.value)} /></label>}
          <label className="text-sm text-slate-600">수량<input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-3 text-lg" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          {payload?.fields.gap !== false && <label className="text-sm text-slate-600">배치 간격(mm)<input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-3 text-lg" value={gap} onChange={(e) => setGap(e.target.value)} /></label>}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {result?.missing.map((item) => <p key={item} className="text-sm text-amber-800">{item}</p>)}
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-sm text-slate-500">직원이 안내할 추천 공급가</p>
        <p className="text-4xl font-semibold text-slate-900">{won(result?.recommendedSupplyPrice)}</p>
        <p className="text-sm text-slate-600">총제작원가 {won(result?.supplyCost)}</p>
        <p className="text-sm text-slate-600">목표 이익률 추천가 {won(result?.targetSupplyPrice)}</p>
        <p className="text-sm text-slate-600">최소 판매금액 {won(result?.productMinimumSupply)}</p>
        <label className="block text-sm text-slate-700">실제 견적 공급가
          <input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-3 text-2xl" value={offered} onChange={(e) => setOffered(e.target.value)} />
        </label>
        <p className="text-sm text-slate-700">부가세 {won(vat?.vat)} · 총액 {won(vat?.total)}</p>
        {margin != null && <p className="text-sm text-slate-700">예상 이익률 {(margin * 100).toFixed(1)}%</p>}
        {belowFloor && <p className="text-sm text-amber-800">최소 판매금액보다 낮습니다. 관리자 확인이 필요합니다.</p>}
        {belowRate && <p className="text-sm text-amber-800">최소 확보 이익률 20%보다 낮습니다. 관리자 확인이 필요합니다.</p>}
        {result?.warnings.map((warning) => <p key={warning} className="text-sm text-amber-800">{warning}</p>)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          <input className="border border-slate-300 rounded-lg px-3 py-2" placeholder="담당자" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
          <input className="border border-slate-300 rounded-lg px-3 py-2" placeholder="거래처 (선택)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="sm:col-span-2 border border-slate-300 rounded-lg px-3 py-2" placeholder="가격을 조정한 이유" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="button" className="bg-slate-800 text-white rounded-lg px-4 py-3" onClick={() => void save()}>이 금액으로 기록</button>
        {saved && <p className="text-sm text-slate-600">{saved}</p>}
      </section>
    </div>
  );
}
