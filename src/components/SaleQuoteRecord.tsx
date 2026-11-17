"use client";

import { useRef, useState } from "react";

export interface SaleRecordSnapshot {
  productId: string;
  label: string;
  supplyPrice: number;
  vat: number;
  total: number;
  qty: number;
  widthMm?: number;
  heightMm?: number;
  stale?: boolean;
  input?: Record<string, string | number>;
}

export function saleRecordBody(snapshot: SaleRecordSnapshot, staffName: string, customerName: string) {
  return {
    productId: snapshot.productId,
    input: {
      ...snapshot.input,
      label: snapshot.label,
      qty: snapshot.qty,
      ...(snapshot.widthMm != null ? { widthMm: snapshot.widthMm } : {}),
      ...(snapshot.heightMm != null ? { heightMm: snapshot.heightMm } : {}),
    },
    salePolicyRevision: 0,
    costLibraryRevision: 0,
    marginPolicyRevision: 0,
    presentedSupplyPrice: snapshot.supplyPrice,
    presentedVat: snapshot.vat,
    presentedTotal: snapshot.total,
    staffName,
    customerName,
  };
}

function won(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function SaleQuoteRecord({
  role,
  snapshot,
}: {
  role: "admin" | "staff" | null;
  snapshot: SaleRecordSnapshot | null;
}) {
  const [staffName, setStaffName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const savingRef = useRef(false);
  if (!snapshot) return null;
  const canSave = role === "admin" && !snapshot.stale && !saving;

  const save = async () => {
    if (!snapshot || snapshot.stale || role !== "admin" || savingRef.current) return;
    const current = snapshot;
    savingRef.current = true;
    setSaving(true);
    setSaved("");
    try {
      const res = await fetch("/api/admin/quote-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entry: saleRecordBody(current, staffName, customerName) }),
      });
      setSaved(res.ok ? "이 조건의 견적 금액을 기록했습니다. 나중에 가격이 바뀌어도 이 기록은 바뀌지 않습니다." : "기록을 저장하지 못했습니다.");
    } catch {
      setSaved("기록을 저장하지 못했습니다.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">공급가 {won(snapshot.supplyPrice)} · 부가세 {won(snapshot.vat)} · 최종 {won(snapshot.total)}</p>
      {snapshot.stale && <p className="mt-2 text-sm text-amber-800">규격이나 수량이 바뀌었습니다. 새 계산이 끝나기 전에는 기록할 수 없습니다.</p>}
      <div className="mt-3 space-y-2">
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="담당자" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="거래처 (선택)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </div>
      {role !== "admin" && <p className="mt-3 text-sm text-slate-500">금액은 바로 확인할 수 있습니다. 기록 저장은 관리자 로그인 후에 됩니다.</p>}
      <button type="button" disabled={!canSave} className="mt-3 min-h-12 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white disabled:bg-slate-300" onClick={() => void save()}>이 금액으로 기록</button>
      {saved && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-slate-600">{saved}</p>
          <a className="block font-medium text-blue-700" href="/quotes">저장된 견적 보기</a>
        </div>
      )}
    </div>
  );
}
