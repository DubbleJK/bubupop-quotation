import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import { readConfigMeta } from "@/lib/config/configMeta";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { scanDisplayedDrops } from "@/lib/cost/legacySale";
import { compareQuantities, simulatePricing } from "@/lib/cost/pricing";
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
  let qtys: number[] = [1, 10, 50, 100, 500];
  try {
    const body = (await request.json()) as { input?: SimulationInput; library?: CostLibrary; qtys?: number[] };
    input = body.input;
    if (isLibrary(body.library)) libraryFromClient = body.library;
    if (Array.isArray(body.qtys) && body.qtys.every((qty) => Number.isFinite(qty))) qtys = body.qtys;
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
  const comparison = compareQuantities(library, config, input, qtys, seoulToday());
  const recipe = library.recipes.find((row) => row.productId === input.productId);
  const sale = readConfigMeta(config);
  return NextResponse.json({
    result,
    comparison,
    salePolicyRevision: sale.revision,
    quantityDrops: recipe ? scanDisplayedDrops(config, recipe).slice(0, 8) : [],
  });
}
