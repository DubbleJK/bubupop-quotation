"use client";

import type { ProductItem } from "@/lib/config/types";

export interface ProductSelectorProps {
  products: ProductItem[];
  value: string;
  onChange: (productId: string) => void;
}

export function ProductSelector({ products, value, onChange }: ProductSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">제품</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
