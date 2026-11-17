import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { simulatePricing } from "@/lib/cost/pricing";
import { quoteStage, quoteStageLabel, recipeIssues } from "@/lib/cost/recipeHealth";
import type { SimulationInput } from "@/lib/cost/types";
import { quoteCalculationForRole } from "@/lib/cost/quoteView";
import { ADMIN_COOKIE_NAME, readSession } from "@/server/adminSession";
import { readKvConfig } from "@/server/kvConfig";
import { readCostLibrary } from "@/server/kvCostLibrary";

/** 견적 금액과 용지 사용량. 원가 내역은 관리자 세션에만 포함한다. */
export async function POST(request: NextRequest) {
  const role = readSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value)?.role === "admin" ? "admin" : "staff";
  let input: SimulationInput | undefined;
  try {
    const body = (await request.json()) as { input?: SimulationInput };
    input = body.input;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!input?.productId || !Number.isFinite(input.qty)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const stored = await readCostLibrary();
  if (stored.state !== "ok") return NextResponse.json({ error: "cost_unreadable" }, { status: 503 });
  const recipe = stored.library.recipes.find((row) => row.productId === input?.productId);
  if (!recipe) return NextResponse.json({ error: "missing_product" }, { status: 404 });
  const storedSale = await readKvConfig();
  const config: AppConfig = storedSale.state === "ok" ? storedSale.config : getFileConfig();
  const usages = new Set(recipe.lines.map((line) => line.usage));
  const needsSize = [...usages].some((usage) => usage === "per-meter-layout" || usage === "per-sheet-imposition" || usage === "per-m2");
  const result = simulatePricing(stored.library, config, input, seoulToday());
  const stage = quoteStage(stored.library, recipe);
  return NextResponse.json(quoteCalculationForRole({
    label: recipe.label,
    stage,
    stageLabel: quoteStageLabel(stage),
    issues: recipeIssues(stored.library, recipe),
    fields: { width: needsSize, height: needsSize, gap: usages.has("per-meter-layout") || usages.has("per-sheet-imposition") },
    result: {
      missing: result.missing,
      warnings: result.warnings,
      supplyCost: result.supplyCost,
      targetRate: recipe.legacyQuoteId ? undefined : stored.library.margins.find((row) => row.productId === recipe.productId)?.targetRate ?? 0.35,
      targetSupplyPrice: result.target?.supplyPrice,
      productMinimumSupply: result.productMinimumSupply,
      recommendedSupplyPrice: result.recommendedSupplyPrice,
      vatRate: result.vatRateUsed,
      lines: result.lines.map((line) => ({ name: line.name, kind: line.kind, supplyCost: line.supplyCost, usageQty: line.usageQty, unitLabel: line.unitLabel, layoutQty: line.layoutQty, layoutUnit: line.layoutUnit, spec: line.spec, perSheet: line.perSheet, sheetWidthMm: line.sheetWidthMm, sheetHeightMm: line.sheetHeightMm, reason: line.reason, usageNote: line.usageNote })),
      costLibraryRevision: result.costLibraryRevision,
    },
  }, role, {
    secondsPerSheet: config.settings.stickerCutSecondsPerSheet,
    minutesPerMeter: config.settings.dtfMinutesPerM,
  }));
}
