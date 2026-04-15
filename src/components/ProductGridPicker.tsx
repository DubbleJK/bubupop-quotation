"use client";

import type { ProductItem } from "@/lib/config/types";

const baseBtn =
  "rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

const inactiveBtn = "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/40";
const activeBtn = "border-blue-500 bg-blue-50 text-blue-900 shadow-sm";

export interface ProductGridPickerProps {
  products: ProductItem[];
  value: string;
  onChange: (productId: string) => void;
}

/** 견적 품목을 드롭다운 대신 버튼 그리드로 선택 */
export function ProductGridPicker({ products, value, onChange }: ProductGridPickerProps) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">견적 품목</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`${baseBtn} ${value === p.id ? activeBtn : inactiveBtn}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
