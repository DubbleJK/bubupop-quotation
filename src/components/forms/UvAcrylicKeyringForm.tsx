"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateQuote,
  uvRecordAmounts,
  type UvAcrylicKeyringQuote,
} from "@/lib/calc/uvAcrylicKeyring";
import type { SummaryPayload } from "../StickySummary";

export interface UvRecordSnapshot {
  width: number;
  height: number;
  qty: number;
  supplyTotal: number;
  vat: number;
  finalPrice: number;
  stale: boolean;
}

export interface UvAcrylicKeyringFormProps {
  onReset: () => void;
  onSummaryChange?: (payload: SummaryPayload) => void;
  onRecordChange?: (snapshot: UvRecordSnapshot | null) => void;
}

const MAX_DIMENSION_MM = 1000;
const MAX_QTY = 100000;

function formatWon(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatArea(value: number): string {
  return `${value.toFixed(2)}㎠`;
}

function validateInput(
  width: string,
  height: string,
  qty: string
): { width: number; height: number; qty: number } | { error: string } | null {
  if (!width || !height || !qty) return null;

  const parsedWidth = Number(width);
  if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
    return { error: "가로값을 올바르게 입력해주세요." };
  }

  const parsedHeight = Number(height);
  if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
    return { error: "세로값을 올바르게 입력해주세요." };
  }

  const parsedQty = Number(qty);
  if (!Number.isFinite(parsedQty) || parsedQty < 1 || !Number.isInteger(parsedQty)) {
    return { error: "수량은 1 이상의 정수로 입력해주세요." };
  }

  return { width: parsedWidth, height: parsedHeight, qty: parsedQty };
}

export function UvAcrylicKeyringForm({ onReset, onSummaryChange, onRecordChange }: UvAcrylicKeyringFormProps) {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [qty, setQty] = useState("");
  const [settledSpec, setSettledSpec] = useState("");
  const [result, setResult] = useState<UvAcrylicKeyringQuote | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [copyMessage, setCopyMessage] = useState<string | undefined>(undefined);
  const [autoCalculate, setAutoCalculate] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  const unitPriceWithVat = useMemo(() => {
    if (!result) return null;
    return Math.round(result.unitSupplyPrice * 1.1);
  }, [result]);

  const summaryItems = useMemo(() => {
    if (!result) return [];
    return [
      { label: "개당 공급가", value: result.unitSupplyPrice },
      { label: "공급가 합계", value: result.supplyTotal },
      { label: "부가세", value: result.vat },
      { label: "최종 판매가", value: result.finalPrice },
    ];
  }, [result]);

  const applyCalculation = useCallback((nextWidth: string, nextHeight: string, nextQty: string) => {
    const validated = validateInput(nextWidth, nextHeight, nextQty);
    if (validated == null) {
      setError(undefined);
      setWarning(undefined);
      setResult(null);
      setSettledSpec("");
      return;
    }

    if ("error" in validated) {
      setError(validated.error);
      setWarning(undefined);
      setResult(null);
      setSettledSpec("");
      return;
    }

    const nextWarning =
      validated.width > MAX_DIMENSION_MM ||
      validated.height > MAX_DIMENSION_MM ||
      validated.qty > MAX_QTY
        ? "입력값이 매우 큽니다. 실제 제작 조건을 다시 확인해주세요."
        : undefined;

    const nextResult = calculateQuote({
      width: validated.width,
      height: validated.height,
      qty: validated.qty,
    });

    setResult(nextResult);
    setSettledSpec(`${nextWidth}|${nextHeight}|${nextQty}`);
    setError(undefined);
    setWarning(nextWarning);
  }, []);

  const spec = `${width}|${height}|${qty}`;
  const stale = Boolean(result) && settledSpec !== spec;

  useEffect(() => {
    onSummaryChange?.({
      mainValue: result?.finalPrice,
      mainLabel: "최종 판매가 (VAT 포함, 정책 적용)",
      items: summaryItems,
      error,
    });
  }, [result?.finalPrice, summaryItems, error, onSummaryChange]);

  useEffect(() => {
    if (!result) {
      onRecordChange?.(null);
      return;
    }
    onRecordChange?.({
      width: result.width,
      height: result.height,
      qty: result.qty,
      supplyTotal: result.supplyTotal,
      vat: result.vat,
      finalPrice: result.finalPrice,
      stale,
    });
  }, [result, stale, onRecordChange]);

  useEffect(() => () => onRecordChange?.(null), [onRecordChange]);

  const handleCopy = async () => {
    if (!result) return;

    const text = [
      `사이즈: ${result.width}x${result.height}mm`,
      `수량: ${result.qty}개`,
      `면적: ${formatArea(result.area)}`,
      `개당 공급가: ${formatWon(result.unitSupplyPrice)} (VAT 포함 ${formatWon(
        Math.round(result.unitSupplyPrice * 1.1)
      )})`,
      `공급가 합계: ${formatWon(result.supplyTotal)}`,
      `부가세: ${formatWon(result.vat)}`,
      `기본 최종금액: ${formatWon(result.baseTotal)}`,
      `가격 정책: ${result.adjustmentLabel}`,
      `최종 판매가: ${formatWon(result.finalPrice)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("견적 내용을 복사했습니다.");
    } catch {
      setCopyMessage("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">가로 (mm)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={width}
            onChange={(e) => {
              const next = e.target.value;
              setWidth(next);
              if (autoCalculate) applyCalculation(next, height, qty);
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="예: 45"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">세로 (mm)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={height}
            onChange={(e) => {
              const next = e.target.value;
              setHeight(next);
              if (autoCalculate) applyCalculation(width, next, qty);
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="예: 30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">수량 (개)</span>
          <input
            type="number"
            min={1}
            step="1"
            value={qty}
            onChange={(e) => {
              const next = e.target.value;
              setQty(next);
              if (autoCalculate) applyCalculation(width, height, next);
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="예: 100"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => applyCalculation(width, height, qty)}
          className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"
        >
          견적 계산하기
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoCalculate}
            onChange={(e) => {
              const checked = e.target.checked;
              setAutoCalculate(checked);
              if (checked) applyCalculation(width, height, qty);
            }}
            className="accent-slate-700"
          />
          입력값 변경 시 자동 계산
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {warning && <p className="text-sm text-amber-600">{warning}</p>}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm text-slate-700">
            개당 공급가: {formatWon(result.unitSupplyPrice)}{" "}
            {result.qty === 1 ? (
              <span className="font-bold text-slate-900">
                (부가세 포함 최종 {formatWon(result.finalPrice)})
              </span>
            ) : unitPriceWithVat != null && (
              <span className="font-bold text-slate-900">
                (VAT 포함 {formatWon(unitPriceWithVat)})
              </span>
            )}
          </p>
          <p className="text-sm text-slate-700">공급가 합계: {formatWon(result.supplyTotal)}</p>
          <p className="text-sm text-slate-700">부가세: {formatWon(result.vat)}</p>
          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-1">최종 판매가</p>
            <p className="text-3xl font-bold text-slate-900">{formatWon(result.finalPrice)}</p>
          </div>

          <details className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              상세보기
            </summary>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>면적: {formatArea(result.area)}</p>
              <p>기본 최종금액: {formatWon(result.baseTotal)}</p>
              <p>적용 구간: {result.quantityBracket} 구간</p>
              <p>적용 가격 정책: {result.adjustmentLabel} 적용</p>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100"
            >
              결과 복사
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showDebug}
                onChange={(e) => setShowDebug(e.target.checked)}
                className="accent-slate-700"
              />
              개발자 옵션 보기
            </label>
            {copyMessage && <span className="text-xs text-slate-500">{copyMessage}</span>}
          </div>

          {showDebug && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-1">
              <p>기본 최종금액: {formatWon(result.baseTotal)}</p>
              <p>조정률: {result.adjustmentRate}</p>
              <p>
                적용 공식: 최종 판매가 = Math.round(기본 최종금액 x 조정률) = Math.round(
                {result.baseTotal.toLocaleString("ko-KR")} x {result.adjustmentRate})
              </p>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 leading-relaxed">
        <p>본 견적은 자유형 기준 자동 계산 견적입니다.</p>
        <p>실제 작업 내용, 부자재, 포장 방식, 인쇄 조건에 따라 금액은 달라질 수 있습니다.</p>
      </div>

      <button
        type="button"
        onClick={() => {
          setWidth("");
          setHeight("");
          setQty("");
          setResult(null);
          setSettledSpec("");
          setError(undefined);
          setWarning(undefined);
          setCopyMessage(undefined);
          onReset();
        }}
        className="text-sm text-slate-600 hover:text-slate-800 underline"
      >
        초기화
      </button>
    </div>
  );
}

export function UvQuoteRecord({
  role,
  snapshot,
}: {
  role: "admin" | "staff" | null;
  snapshot: UvRecordSnapshot | null;
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
    const amounts = uvRecordAmounts({
      width: current.width,
      height: current.height,
      qty: current.qty,
      area: 0,
      quantityBracket: "",
      unitSupplyPrice: current.supplyTotal,
      supplyTotal: current.supplyTotal,
      vat: current.vat,
      baseTotal: current.finalPrice,
      adjustmentRate: 1,
      adjustmentLabel: "",
      finalPrice: current.finalPrice,
    });
    const res = await fetch("/api/admin/quote-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entry: {
          productId: "uv-acrylic-keyring",
          input: {
            label: "UV아크릴키링",
            widthMm: current.width,
            heightMm: current.height,
            qty: current.qty,
          },
          salePolicyRevision: 0,
          costLibraryRevision: 0,
          marginPolicyRevision: 0,
          presentedSupplyPrice: amounts.presentedSupplyPrice,
          presentedVat: amounts.presentedVat,
          presentedTotal: amounts.presentedTotal,
          staffName,
          customerName,
        },
      }),
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
      <p className="text-sm text-slate-600">공급가 {formatWon(snapshot.supplyTotal)} · 부가세 {formatWon(snapshot.vat)} · 최종 {formatWon(snapshot.finalPrice)}</p>
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

