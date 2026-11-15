import { NextRequest, NextResponse } from "next/server";
import { appendQuoteLog, readQuoteLog, type QuoteHistoryEntry } from "@/server/kvQuoteLog";
import { requireAdmin } from "@/server/requireAdmin";

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
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
  const denied = requireAdmin(request);
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
  const written = await appendQuoteLog(entry);
  if (!written.ok) return NextResponse.json({ error: written.reason }, { status: 503 });
  return NextResponse.json({ ok: true, entry: written.entry });
}
