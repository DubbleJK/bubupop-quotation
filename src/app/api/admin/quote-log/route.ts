import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { simulatePricing } from "@/lib/cost/pricing";
import { rejectQuoteSave } from "@/lib/cost/quoteSave";
import { quoteEntryForRole } from "@/lib/cost/quoteView";
import type { SimulationInput } from "@/lib/cost/types";
import { ADMIN_COOKIE_NAME, readSession } from "@/server/adminSession";
import { readKvConfig } from "@/server/kvConfig";
import { readCostLibrary } from "@/server/kvCostLibrary";
import { appendQuoteLog, readQuoteLog, type QuoteHistoryEntry } from "@/server/kvQuoteLog";
import { requireQuoteAccess } from "@/server/requireAdmin";

function roleOf(request: NextRequest): "admin" | "staff" {
  return readSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value)?.role === "admin" ? "admin" : "staff";
}

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
    popCut: input.popCut === "4" || input.popCut === "2" ? input.popCut : undefined,
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
    const role = roleOf(request);
    return NextResponse.json({ entries: stored.entries.map((entry) => quoteEntryForRole(entry, role)), source: stored.where === "dev-file" ? "dev-file" : "server", limit: 200 });
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
  let saving: Omit<QuoteHistoryEntry, "id" | "createdAt"> = entry;
  const stored = await readCostLibrary();
  if (stored.state === "ok") {
    const storedSale = await readKvConfig();
    const config: AppConfig = storedSale.state === "ok" ? storedSale.config : getFileConfig();
    const reason = rejectQuoteSave(stored.library, config, {
      productId: saving.productId,
      input: simulationFrom(saving),
      presentedSupplyPrice: saving.presentedSupplyPrice,
      supplyCost: saving.internal?.supplyCost,
      recommendedSupplyPrice: saving.internal?.recommendedSupplyPrice,
      priceConfirmed: saving.priceConfirmed,
    }, seoulToday());
    if (reason) return NextResponse.json({ error: "stale_quote", message: reason }, { status: 409 });
    const recipe = stored.library.recipes.find((row) => row.productId === saving.productId);
    if (recipe && !recipe.legacyQuoteId) {
      const result = simulatePricing(stored.library, config, simulationFrom(saving), seoulToday());
      const margin = result.recommendedSupplyPrice != null && result.supplyCost != null && result.recommendedSupplyPrice > 0
        ? (result.recommendedSupplyPrice - result.supplyCost) / result.recommendedSupplyPrice
        : undefined;
      saving = {
        ...saving,
        costLibraryRevision: result.costLibraryRevision,
        internal: {
          supplyCost: result.supplyCost,
          targetSupplyPrice: result.target?.supplyPrice,
          minimumSupplyPrice: result.productMinimumSupply,
          recommendedSupplyPrice: result.recommendedSupplyPrice,
          marginRate: margin,
          missing: result.missing,
          lines: result.lines.map((line) => ({ name: line.name, kind: line.kind, supplyCost: line.supplyCost })),
        },
      };
    }
  }
  const written = await appendQuoteLog(saving);
  if (!written.ok) return NextResponse.json({ error: written.reason }, { status: 503 });
  return NextResponse.json({ ok: true, entry: quoteEntryForRole(written.entry, roleOf(request)) });
}
