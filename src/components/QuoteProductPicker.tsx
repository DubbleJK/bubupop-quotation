"use client";

import { useState } from "react";
import type { PublicCatalog } from "@/lib/cost/publicCatalog";

export function QuoteProductPicker({
  catalog,
  productId,
  onSelect,
}: {
  catalog: PublicCatalog | null;
  productId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [pickedGroup, setPickedGroup] = useState<string | null>(null);
  const text = query.trim();
  const sections = [
    ...(catalog?.groups.map((group) => ({ id: group.id, label: group.label, products: group.products })) ?? []),
    { id: "ungrouped", label: "그룹 없음", products: catalog?.ungrouped ?? [] },
  ].filter((section) => section.products.length > 0);
  const productGroup = sections.find((section) => section.products.some((item) => item.id === productId || item.legacyQuoteId === productId))?.id ?? null;
  const visibleSections = text === "" ? sections : sections.filter((section) => section.label.includes(text) || section.products.some((item) => item.label.includes(text) || (item.description ?? "").includes(text)));
  const activeGroup = visibleSections.some((section) => section.id === (pickedGroup ?? productGroup)) ? (pickedGroup ?? productGroup) : visibleSections[0]?.id ?? null;
  const activeProducts = (visibleSections.find((section) => section.id === activeGroup)?.products ?? []).filter((item) => text === "" || item.label.includes(text) || (item.description ?? "").includes(text) || visibleSections.find((section) => section.id === activeGroup)?.label.includes(text));

  return (
    <div>
      <input id="product-search" className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="상품명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={section.id === activeGroup}
            className={`min-h-11 rounded-full px-4 py-2 text-sm ${section.id === activeGroup ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            onClick={() => setPickedGroup(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-1" role="radiogroup" aria-label="판매 품목">
        {activeProducts.map((item) => {
          const selected = item.id === productId || item.legacyQuoteId === productId;
          return (
            <label key={item.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${selected ? "bg-slate-100 ring-1 ring-slate-300" : ""}`}>
              <input type="radio" name="staff-quote-product" className="h-4 w-4" checked={selected} onChange={() => { setPickedGroup(activeGroup); onSelect(item.legacyQuoteId ?? item.id); }} />
              <span>
                <span className="font-medium text-slate-900">{item.label}</span>
                {item.note ? <span className="ml-2 text-xs text-amber-700">{item.note}</span> : null}
              </span>
            </label>
          );
        })}
        {activeProducts.length === 0 && <p className="text-sm text-slate-500">이 그룹에서 찾는 품목이 없습니다.</p>}
      </div>
    </div>
  );
}
