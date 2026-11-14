import { NextRequest, NextResponse } from "next/server";
import { emptyCostLibrary } from "@/lib/cost/library";
import type { CostLibrary } from "@/lib/cost/types";
import { readCostLibrary, writeCostLibrary } from "@/server/kvCostLibrary";
import { requireAdmin } from "@/server/requireAdmin";

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const stored = await readCostLibrary();
  if (stored.state === "error") {
    return NextResponse.json({ error: "cost_unreadable" }, { status: 503 });
  }
  if (stored.state === "ok") {
    return NextResponse.json({ library: stored.library, source: "server" });
  }
  return NextResponse.json({
    library: emptyCostLibrary(),
    source: stored.state === "unconfigured" ? "unconfigured" : "empty",
  });
}

export async function PUT(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let library: CostLibrary | undefined;
  try {
    const body = (await request.json()) as { library?: CostLibrary };
    library = body.library;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!library?.materials || !library.processes || !library.recipes) {
    return NextResponse.json({ error: "invalid_library" }, { status: 400 });
  }
  const written = await writeCostLibrary(library);
  if (!written.ok) {
    const status = written.reason === "in_use" ? 409 : 503;
    return NextResponse.json({ error: written.reason }, { status });
  }
  return NextResponse.json({ ok: true, library: written.library });
}
