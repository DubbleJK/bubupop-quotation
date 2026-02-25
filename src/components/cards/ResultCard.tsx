"use client";

export interface ResultCardProps {
  title: string;
  disabled?: boolean;
  disabledReason?: string;
  children: React.ReactNode;
}

export function ResultCard({ title, disabled, disabledReason, children }: ResultCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        disabled
          ? "border-slate-200 bg-slate-50 opacity-70"
          : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {disabled && disabledReason && (
        <p className="text-slate-500 text-sm mb-2">{disabledReason}</p>
      )}
      {children}
    </div>
  );
}
