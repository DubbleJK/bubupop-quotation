"use client";

import { useEffect, useRef, useState } from "react";

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
  choices?: SaleRecordChoice[];
}

export interface SaleRecordChoice {
  id: string;
  supplyPrice: number;
  vat: number;
  total: number;
  sheets: number;
  disabled?: boolean;
}

export function chosenSaleRecord(snapshot: SaleRecordSnapshot, selectedId: string): SaleRecordChoice | null {
  const choices = snapshot.choices?.filter((choice) => !choice.disabled) ?? [];
  if (choices.length === 0) return null;
  return choices.find((choice) => choice.id === selectedId) ?? choices[0] ?? null;
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
  onChoiceChange,
}: {
  role: "admin" | "staff" | null;
  snapshot: SaleRecordSnapshot | null;
  onChoiceChange?: (choice: SaleRecordChoice | null) => void;
}) {
  const [staffName, setStaffName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [choiceId, setChoiceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const savingRef = useRef(false);
  useEffect(() => {
    const first = snapshot?.choices?.find((choice) => !choice.disabled);
    setChoiceId(first?.id ?? "");
  }, [snapshot]);
  const selected = snapshot?.choices?.length ? chosenSaleRecord(snapshot, choiceId) : null;
  useEffect(() => {
    onChoiceChange?.(selected);
  }, [onChoiceChange, selected]);
  if (!snapshot) return null;
  const supplyPrice = selected?.supplyPrice ?? snapshot.supplyPrice;
  const vat = selected?.vat ?? snapshot.vat;
  const total = selected?.total ?? snapshot.total;
  const canSave = role === "admin" && !snapshot.stale && !saving && (!snapshot.choices?.length || selected != null);

  const save = async () => {
    if (!snapshot || snapshot.stale || role !== "admin" || savingRef.current) return;
    if (snapshot.choices?.length && !selected) return;
    const current = selected
      ? {
          ...snapshot,
          label: `${snapshot.label} ${selected.id}`,
          supplyPrice: selected.supplyPrice,
          vat: selected.vat,
          total: selected.total,
          input: { ...snapshot.input, sheet: selected.id, sheets: selected.sheets },
        }
      : snapshot;
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
      <p className="text-sm text-slate-600">공급가 {won(supplyPrice)} · 부가세 {won(vat)} · 최종 {won(total)}</p>
      {snapshot.stale && <p className="mt-2 text-sm text-amber-800">규격이나 수량이 바뀌었습니다. 새 계산이 끝나기 전에는 기록할 수 없습니다.</p>}
      <div className="mt-3 space-y-2">
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="담당자" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
        <input className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="거래처 (선택)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </div>
      {role !== "admin" && <p className="mt-3 text-sm text-slate-500">금액은 바로 확인할 수 있습니다. 기록 저장은 관리자 로그인 후에 됩니다.</p>}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {snapshot.choices && snapshot.choices.length > 0 && (
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium text-slate-800">기록할 규격</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-700">
              {snapshot.choices.map((choice) => (
                <label key={choice.id} className="inline-flex items-center gap-1">
                  <input type="radio" name="record-sheet" value={choice.id} checked={selected?.id === choice.id} disabled={choice.disabled} onChange={() => setChoiceId(choice.id)} />
                  {choice.id}{choice.disabled ? " 불가" : ` · ${choice.sheets}장`}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button type="button" disabled={!canSave} className="min-h-12 w-full rounded-xl bg-blue-700 py-3 font-semibold text-white disabled:bg-slate-300 sm:w-auto sm:px-4" onClick={() => void save()}>이 금액으로 기록</button>
      </div>
      {saved && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-slate-600">{saved}</p>
          <a className="block font-medium text-blue-700" href="/quotes">저장된 견적 보기</a>
        </div>
      )}
    </div>
  );
}
