"use client";

import { useEffect, useState, type FormEvent } from "react";
import { QuoteHeader } from "@/components/QuoteHeader";
import { formatSeoulMinute } from "@/lib/time/seoul";

interface Entry {
  id: string;
  createdAt: string;
  productId: string;
  presentedSupplyPrice: number;
  presentedVat?: number;
  presentedTotal?: number;
  staffName?: string;
  customerName?: string;
  adjustmentReason?: string;
  input?: Record<string, number | string>;
  internal?: {
    supplyCost?: number;
    targetSupplyPrice?: number;
    recommendedSupplyPrice?: number;
    lines?: { name?: string; supplyCost?: number }[];
  };
}

function won(value?: number): string {
  return value == null ? "기록 없음" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export default function QuotesPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<"admin" | "staff" | null>(null);
  const [pin, setPin] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recalc, setRecalc] = useState<{ id: string; state: "loading" | "done" | "error"; cost?: number; recommended?: number; margin?: number; message?: string } | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    const session = await fetch("/api/admin/session");
    if (!session.ok) {
      setRole(null);
      setAuthed(false);
      return;
    }
    const sessionBody = (await session.json()) as { role?: string };
    setRole(sessionBody.role === "staff" ? "staff" : "admin");
    const res = await fetch("/api/admin/quote-log");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = (await res.json()) as { entries?: Entry[] };
    setEntries([...(data.entries ?? [])].reverse());
    setAuthed(true);
  };

  useEffect(() => {
    void load();
  }, []);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setRole(null);
    setAuthed(false);
    setEntries([]);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      setPin("");
      await load();
    }
  };

  const remove = async (entry: Entry) => {
    const label = String(entry.input?.label ?? entry.productId);
    if (!window.confirm(`${label} 기록을 삭제합니다. 삭제한 견적은 되돌릴 수 없습니다.`)) return;
    setNote(null);
    const res = await fetch("/api/admin/quote-log", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    });
    if (!res.ok) {
      setNote("기록을 삭제하지 못했습니다.");
      return;
    }
    setEntries((current) => current.filter((row) => row.id !== entry.id));
    if (openId === entry.id) setOpenId(null);
  };

  const requote = async (entry: Entry) => {
    setRecalc({ id: entry.id, state: "loading" });
    const res = await fetch("/api/quote/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          productId: entry.productId,
          qty: Number(entry.input?.qty) || 1,
          widthMm: Number(entry.input?.widthMm) || undefined,
          heightMm: Number(entry.input?.heightMm) || undefined,
          gapMm: Number(entry.input?.gapMm) || undefined,
        },
      }),
    });
    const data = (await res.json()) as { result?: { supplyCost?: number; recommendedSupplyPrice?: number } };
    if (!res.ok || data.result?.recommendedSupplyPrice == null || (role === "admin" && data.result.supplyCost == null)) {
      setRecalc({ id: entry.id, state: "error", message: "지금 원가로는 다시 계산하지 못했습니다. 저장된 금액은 그대로입니다." });
      return;
    }
    const recommended = data.result.recommendedSupplyPrice;
    const cost = data.result.supplyCost;
    const margin = cost != null && recommended > 0 ? (recommended - cost) / recommended : undefined;
    setRecalc({ id: entry.id, state: "done", cost, recommended, margin });
  };

  if (authed === null) return <main className="min-h-screen bg-slate-100 p-6 text-slate-600">기록을 확인하는 중입니다.</main>;
  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-100">
        <QuoteHeader current="quotes" role={null} />
        <div className="p-6">
        <form onSubmit={login} className="mx-auto max-w-sm rounded-2xl bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">견적 기록</h1>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-3" placeholder="PIN" />
          <button className="mt-3 w-full rounded-xl bg-blue-700 py-3 text-white">로그인</button>
        </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <QuoteHeader current="quotes" role={role} onLogin={role !== "admin" ? () => setLoginOpen(true) : undefined} onLogout={() => void logout()} />
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {loginOpen && role !== "admin" && (
          <form onSubmit={login} className="mb-4 rounded-2xl bg-white p-4">
            <p className="text-sm font-medium text-slate-800">관리자 PIN으로 다시 로그인</p>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-3" placeholder="PIN" />
            <button className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-sm text-white">로그인</button>
          </form>
        )}
        <h1 className="text-2xl font-semibold text-slate-900">견적 기록</h1>
        <p className="mt-1 text-sm text-slate-500">저장된 금액은 당시 계산입니다. 다시 계산해도 원본은 바뀌지 않습니다.</p>
        {note && <p className="mt-3 text-sm text-red-700">{note}</p>}
        {entries.length === 0 && <p className="mt-4 text-sm text-slate-500">남긴 견적이 없습니다.</p>}
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
                <p className="font-medium text-slate-900">{String(entry.input?.label ?? entry.productId)}</p>
                <p className="text-sm text-slate-500">{formatSeoulMinute(entry.createdAt)} · 공급가 (VAT 별도) {won(entry.presentedSupplyPrice)} · 총액 {won(entry.presentedTotal)}</p>
              </button>
              {role === "admin" && (
                <button type="button" className="shrink-0 text-sm font-medium text-red-700" onClick={() => void remove(entry)}>삭제</button>
              )}
              </div>
              {openId === entry.id && (
                <dl className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  <div>일시 {formatSeoulMinute(entry.createdAt)}</div>
                  <div>담당자 {entry.staffName || "기록 없음"}</div>
                  <div>거래처 {entry.customerName || "기록 없음"}</div>
                  <div>규격 {entry.input?.widthMm ?? "—"}×{entry.input?.heightMm ?? "—"}mm</div>
                  <div>수량 {entry.input?.qty ?? "—"}</div>
                  <div className="sm:col-span-2 mt-2 font-medium text-slate-900">당시 견적</div>
                  <div>실제 제시 공급가 (VAT 별도) {won(entry.presentedSupplyPrice)}</div>
                  <div>부가세 {won(entry.presentedVat)}</div>
                  <div>부가세 포함 총액 {won(entry.presentedTotal)}</div>
                  {role === "admin" && <div>당시 제작원가 {won(entry.internal?.supplyCost)}</div>}
                  {role === "admin" && <div>당시 추천 공급가 {won(entry.internal?.recommendedSupplyPrice ?? entry.internal?.targetSupplyPrice)}</div>}
                  <div className="sm:col-span-2">조정 사유 {entry.adjustmentReason || "기록 없음"}</div>
                  {role === "admin" && <button type="button" className="mt-2 text-left font-medium text-blue-700" onClick={() => void requote(entry)}>지금 원가로 다시 계산</button>}
                  {recalc?.id === entry.id && (
                    <div className="sm:col-span-2 mt-2 rounded-xl bg-slate-50 p-3">
                      <p className="font-medium text-slate-900">현재 원가로 재계산</p>
                      {recalc.state === "loading" && <p>계산 중입니다. 저장된 견적은 바꾸지 않습니다.</p>}
                      {recalc.state === "error" && <p>{recalc.message}</p>}
                      {recalc.state === "done" && (
                        <>
                          <p>현재 제작원가 {won(recalc.cost)}</p>
                          <p>현재 추천 공급가 {won(recalc.recommended)}</p>
                          <p>당시 추천가와 차액 {won((recalc.recommended ?? 0) - (entry.internal?.recommendedSupplyPrice ?? entry.internal?.targetSupplyPrice ?? 0))}</p>
                          <p>현재 예상 이익률 {recalc.margin == null ? "—" : `${(recalc.margin * 100).toFixed(1)}%`}</p>
                          <p className="text-xs text-slate-500">다시 계산한 금액은 이 화면에만 보입니다. 저장된 기록은 바꾸지 않았습니다.</p>
                        </>
                      )}
                    </div>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
