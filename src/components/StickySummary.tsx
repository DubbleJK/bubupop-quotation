"use client";

export interface SummaryItem {
  label: string;
  value: string | number;
  sub?: { label: string; value: string | number }[];
}

export interface StickySummaryProps {
  title?: string;
  items: SummaryItem[];
  mainValue?: string | number;
  mainLabel?: string;
  error?: string;
}

/** 폼에서 오른쪽 패널로 전달하는 요약 데이터 */
export type SummaryPayload = Pick<
  StickySummaryProps,
  "mainValue" | "mainLabel" | "items" | "error"
>;

function formatKr(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

export function StickySummary({
  title = "견적 요약",
  items,
  mainValue,
  mainLabel = "공급가 (VAT 미포함)",
  error,
}: StickySummaryProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm sticky top-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">{title}</h2>
      {error && (
        <p className="text-red-600 text-sm mb-2">{error}</p>
      )}
      {mainValue !== undefined && mainValue !== "" && (
        <p className="text-2xl font-bold text-slate-900 mb-2">
          {typeof mainValue === "number" ? formatKr(mainValue) : mainValue}
        </p>
      )}
      {mainLabel && mainValue !== undefined && mainValue !== "" && (
        <p className="text-xs text-slate-500 mb-3">{mainLabel}</p>
      )}
      <ul className="space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i}>
            <span className="text-slate-600">{item.label}:</span>{" "}
            {typeof item.value === "number" ? formatKr(item.value) : item.value}
            {item.sub?.map((s, j) => (
              <span key={j} className="block text-xs text-slate-500 ml-2">
                {s.label}: {typeof s.value === "number" ? formatKr(s.value) : s.value}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
