"use client";

import { useEffect, useState, type FormEvent } from "react";
import { calcVatAndTotal } from "@/lib/calc/common";

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
  const [pin, setPin] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recalc, setRecalc] = useState<string>("");

  const load = async () => {
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

  const requote = async (entry: Entry) => {
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
    const data = (await res.json()) as { result?: { supplyCost?: number; recommendedSupplyPrice?: number; vatRate?: number } };
    if (!res.ok || !data.result) {
      setRecalc("지금 원가로는 다시 계산하지 못했습니다. 저장된 금액은 그대로입니다.");
      return;
    }
    const vat = calcVatAndTotal(data.result.recommendedSupplyPrice ?? 0, data.result.vatRate ?? 0.1);
    setRecalc(`지금 원가로 다시 계산하면 원가 ${won(data.result.supplyCost)}, 추천 공급가 ${won(data.result.recommendedSupplyPrice)}, 결제금액 ${won(vat.total)}입니다. 저장된 견적은 바꾸지 않았습니다.`);
  };

  if (authed === null) return <main className="min-h-screen bg-slate-100 p-6 text-slate-600">기록을 확인하는 중입니다.</main>;
  if (!authed) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <form onSubmit={login} className="mx-auto max-w-sm rounded-2xl bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">견적 기록</h1>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-3" placeholder="PIN" />
          <button className="mt-3 w-full rounded-xl bg-blue-700 py-3 text-white">로그인</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex gap-2 text-sm">
          <a className="rounded-full border bg-white px-3 py-1.5" href="/">견적 계산</a>
          <a className="rounded-full bg-blue-700 px-3 py-1.5 text-white" href="/quotes">견적 기록</a>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">견적 기록</h1>
        <p className="mt-1 text-sm text-slate-500">저장된 금액은 당시 계산입니다. 다시 계산해도 원본은 바뀌지 않습니다.</p>
        {recalc && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700">{recalc}</p>}
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
                <p className="font-medium text-slate-900">{String(entry.input?.label ?? entry.productId)}</p>
                <p className="text-sm text-slate-500">{entry.createdAt} · 공급가 {won(entry.presentedSupplyPrice)} · 총액 {won(entry.presentedTotal)}</p>
              </button>
              {openId === entry.id && (
                <dl className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  <div>일시 {entry.createdAt}</div>
                  <div>담당자 {entry.staffName || "기록 없음"}</div>
                  <div>거래처 {entry.customerName || "기록 없음"}</div>
                  <div>규격 {entry.input?.widthMm ?? "—"}×{entry.input?.heightMm ?? "—"}mm</div>
                  <div>수량 {entry.input?.qty ?? "—"}</div>
                  <div>당시 원가 {won(entry.internal?.supplyCost)}</div>
                  <div>당시 추천가 {won(entry.internal?.recommendedSupplyPrice ?? entry.internal?.targetSupplyPrice)}</div>
                  <div>실제 공급가 {won(entry.presentedSupplyPrice)}</div>
                  <div>부가세 {won(entry.presentedVat)}</div>
                  <div>총액 {won(entry.presentedTotal)}</div>
                  <div className="sm:col-span-2">조정 사유 {entry.adjustmentReason || "기록 없음"}</div>
                  <button type="button" className="mt-2 text-left font-medium text-blue-700" onClick={() => void requote(entry)}>지금 원가로 다시 계산</button>
                </dl>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
