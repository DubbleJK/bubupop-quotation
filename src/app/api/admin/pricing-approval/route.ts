import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import type { AppConfig } from "@/lib/config/types";
import { seoulToday } from "@/lib/cost/library";
import { approveRecordedPrice, simulatePricing } from "@/lib/cost/pricing";
import type { SimulationInput } from "@/lib/cost/types";
import { readKvConfig } from "@/server/kvConfig";
import { readCostLibrary, writeCostLibrary } from "@/server/kvCostLibrary";
import { requireAdmin } from "@/server/requireAdmin";

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let body: { confirm?: boolean; productId?: string; input?: SimulationInput } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: "confirm_required" }, { status: 400 });
  }

  const stored = await readCostLibrary();
  if (stored.state === "error") return NextResponse.json({ error: "cost_unreadable" }, { status: 503 });
  if (stored.state !== "ok") return NextResponse.json({ error: "cost_unreadable" }, { status: 503 });

  const storedSale = await readKvConfig();
  const config: AppConfig = storedSale.state === "ok" ? storedSale.config : getFileConfig();
  const input = body.input ?? { productId: body.productId ?? "", qty: 1 };
  const priced = simulatePricing(stored.library, config, input, seoulToday());
  if (!priced.approvalAllowed || priced.target?.supplyPrice == null) {
    return NextResponse.json({ error: "not_approvable" }, { status: 409 });
  }
  const approved = approveRecordedPrice(stored.library, {
    confirm: true,
    productId: input.productId,
    supplyPrice: priced.target.supplyPrice,
  });
  if (!approved.ok) return NextResponse.json({ error: approved.error }, { status: 400 });
  const written = await writeCostLibrary(approved.library);
  if (!written.ok) {
    return NextResponse.json({ error: written.reason }, { status: written.reason === "in_use" ? 409 : 503 });
  }
  return NextResponse.json({
    ok: true,
    library: written.library,
    approvedSupplyPrice: priced.target.supplyPrice,
    saleUnchanged: true,
  });
}
