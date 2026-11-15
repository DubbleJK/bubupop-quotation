import { NextResponse } from "next/server";
import { products } from "@/config/products";
import { buildPublicCatalog, defaultPublicCatalog } from "@/lib/cost/publicCatalog";
import type { LegacyQuoteId } from "@/lib/cost/types";
import { readCostLibrary } from "@/server/kvCostLibrary";

/** 고객 첫 화면용 목록. 매입가, 공정 원가, 이익률은 넣지 않는다. */
export async function GET() {
  const stored = await readCostLibrary();
  if (stored.state === "ok") {
    return NextResponse.json({ catalog: buildPublicCatalog(stored.library), source: "server" });
  }
  const fallback = defaultPublicCatalog(products.map((item) => ({ id: item.id as LegacyQuoteId, label: item.label })));
  if (stored.state === "error") {
    return NextResponse.json({ catalog: fallback, source: "fallback" });
  }
  return NextResponse.json({ catalog: fallback, source: "default" });
}
