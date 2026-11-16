import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { rejectQuoteSave } from "@/lib/cost/quoteSave";
import type { SimulationInput } from "@/lib/cost/types";
import { readKvConfig } from "@/server/kvConfig";
import { readCostLibrary } from "@/server/kvCostLibrary";
import { appendQuoteLog, readQuoteLog, type QuoteHistoryEntry } from "@/server/kvQuoteLog";
import { requireQuoteAccess } from "@/server/requireAdmin";

function simulationFrom(entry: Omit<QuoteHistoryEntry, "id" | "createdAt">): SimulationInput {
  const input = entry.input ?? {};
  const numberOr = (value: number | string | undefined) => {
    if (value == null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    productId: entry.productId,
    qty: numberOr(input.qty) ?? Number.NaN,
    widthMm: numberOr(input.widthMm),
    heightMm: numberOr(input.heightMm),
    gapMm: numberOr(input.gapMm),
  };
}

export async function GET(request: NextRequest) {
  const denied = requireQuoteAccess(request);
  if (denied) return denied;
  const stored = await readQuoteLog();
  if (stored.state === "error") return NextResponse.json({ error: "log_unreadable" }, { status: 503 });
  if (stored.state === "ok") {
    return NextResponse.json({ entries: stored.entries, source: stored.where === "dev-file" ? "dev-file" : "server", limit: 200 });
  }
  return NextResponse.json({
    entries: [],
    source: stored.state === "unconfigured" ? "unconfigured" : stored.where === "dev-file" ? "dev-file" : "empty",
    limit: 200,
  });
}

export async function POST(request: NextRequest) {
  const denied = requireQuoteAccess(request);
  if (denied) return denied;
  let entry: Omit<QuoteHistoryEntry, "id" | "createdAt"> | undefined;
  try {
    const body = (await request.json()) as { entry?: Omit<QuoteHistoryEntry, "id" | "createdAt"> };
    entry = body.entry;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!entry?.productId || !Number.isFinite(entry.presentedSupplyPrice)) {
    return NextResponse.json({ error: "invalid_entry" }, { status: 400 });
  }
  const stored = await readCostLibrary();
  if (stored.state === "ok") {
    const storedSale = await readKvConfig();
    const config: AppConfig = storedSale.state === "ok" ? storedSale.config : getFileConfig();
    const reason = rejectQuoteSave(stored.library, config, {
      productId: entry.productId,
      input: simulationFrom(entry),
      presentedSupplyPrice: entry.presentedSupplyPrice,
      supplyCost: entry.internal?.supplyCost,
      recommendedSupplyPrice: entry.internal?.recommendedSupplyPrice,
      priceConfirmed: entry.priceConfirmed,
    }, seoulToday());
    if (reason) return NextResponse.json({ error: "stale_quote", message: reason }, { status: 409 });
  }
  const written = await appendQuoteLog(entry);
  if (!written.ok) return NextResponse.json({ error: written.reason }, { status: 503 });
  return NextResponse.json({ ok: true, entry: written.entry });
}
