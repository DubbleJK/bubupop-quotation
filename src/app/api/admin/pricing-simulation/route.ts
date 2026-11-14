import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import { readConfigMeta } from "@/lib/config/configMeta";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { scanDisplayedDrops } from "@/lib/cost/legacySale";
import { simulatePricing } from "@/lib/cost/pricing";
import type { CostLibrary, SimulationInput } from "@/lib/cost/types";
import { readKvConfig } from "@/server/kvConfig";
import { readCostLibrary } from "@/server/kvCostLibrary";
import { requireAdmin } from "@/server/requireAdmin";

function isLibrary(value: unknown): value is CostLibrary {
  if (!value || typeof value !== "object") return false;
  const row = value as CostLibrary;
  return Array.isArray(row.materials) && Array.isArray(row.processes) && Array.isArray(row.recipes);
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let input: SimulationInput | undefined;
  let libraryFromClient: CostLibrary | undefined;
  try {
    const body = (await request.json()) as { input?: SimulationInput; library?: CostLibrary };
    input = body.input;
    if (isLibrary(body.library)) libraryFromClient = body.library;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!input?.productId || !Number.isFinite(input.qty)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const storedLibrary = libraryFromClient ? null : await readCostLibrary();
  if (storedLibrary && storedLibrary.state === "error") {
    return NextResponse.json({ error: "cost_unreadable", result: null }, { status: 503 });
  }
  const library =
    libraryFromClient ??
    (storedLibrary && storedLibrary.state === "ok" ? storedLibrary.library : null);
  if (!library) {
    return NextResponse.json({ error: "cost_unreadable", result: null }, { status: 503 });
  }

  const storedSale = await readKvConfig();
  const config: AppConfig = storedSale.state === "ok" ? storedSale.config : getFileConfig();
  const result = simulatePricing(library, config, input, seoulToday());
  const recipe = library.recipes.find((row) => row.productId === input.productId);
  const sale = readConfigMeta(config);
  return NextResponse.json({
    result,
    salePolicyRevision: sale.revision,
    quantityDrops: recipe ? scanDisplayedDrops(config, recipe).slice(0, 8) : [],
  });
}
