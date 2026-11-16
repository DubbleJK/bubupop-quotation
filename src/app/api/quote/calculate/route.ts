import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { simulatePricing } from "@/lib/cost/pricing";
import { quoteStage, quoteStageLabel, recipeIssues } from "@/lib/cost/recipeHealth";
import type { SimulationInput } from "@/lib/cost/types";
import { readKvConfig } from "@/server/kvConfig";
import { readCostLibrary } from "@/server/kvCostLibrary";
import { requireQuoteAccess } from "@/server/requireAdmin";

/** 직원 견적. 서버에 저장된 원가만 쓰고, 원가 라이브러리 자체는 돌려주지 않는다. */
export async function POST(request: NextRequest) {
  const denied = requireQuoteAccess(request);
  if (denied) return denied;
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
  return NextResponse.json({
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
      lines: result.lines.map((line) => ({ name: line.name, kind: line.kind, supplyCost: line.supplyCost, usageQty: line.usageQty, unitLabel: line.unitLabel, reason: line.reason, usageNote: line.usageNote })),
      costLibraryRevision: result.costLibraryRevision,
    },
  });
}
