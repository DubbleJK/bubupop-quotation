import Link from "next/link";
import type { PublicCatalog, PublicMenuItem } from "@/lib/cost/publicCatalog";

const productBtnClass =
  "flex min-h-12 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]";

function ItemLink({ item }: { item: PublicMenuItem }) {
  return (
    <Link href={item.href} className={productBtnClass}>
      <span>{item.label}</span>
      {item.description ? <span className="mt-1 text-xs font-normal text-slate-500">{item.description}</span> : null}
    </Link>
  );
}

/** 고객 첫 화면과 관리자 미리보기가 같은 목록을 쓴다. */
export function CustomerMenuList({ catalog }: { catalog: PublicCatalog }) {
  const items = catalog.flat ? catalog.ungrouped : [];
  if (catalog.flat) {
    if (items.length === 0) {
      return <p className="text-sm text-slate-500">표시할 품목이 없습니다.</p>;
    }
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => <ItemLink key={item.id} item={item} />)}
      </div>
    );
  }
  const sections = [
    ...catalog.groups,
    ...(catalog.ungrouped.length > 0 ? [{ id: "ungrouped", label: "그룹 없음", products: catalog.ungrouped }] : []),
  ];
  if (sections.length === 0) {
    return <p className="text-sm text-slate-500">표시할 품목이 없습니다.</p>;
  }
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.id}>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{section.label}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {section.products.map((item) => <ItemLink key={item.id} item={item} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
