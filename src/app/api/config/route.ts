import { NextResponse } from "next/server";
import type { AppConfig } from "@/lib/config/types";

const KV_KEY = "quotation_admin_config";

async function getKV() {
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

/** 설정 조회 (모든 사용자). KV에 없으면 404 → 클라이언트가 localStorage/파일 기본값 사용 */
export async function GET() {
  const kv = await getKV();
  if (!kv) return NextResponse.json({ error: "KV not configured" }, { status: 404 });
  try {
    const raw = await kv.get<string>(KV_KEY);
    if (!raw) return NextResponse.json(null, { status: 404 });
    const config = typeof raw === "string" ? (JSON.parse(raw) as AppConfig) : raw;
    if (!config?.settings || !config?.products) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(config);
  } catch {
    return NextResponse.json(null, { status: 404 });
  }
}

/** 설정 저장 (PIN 확인). 저장된 설정이 없으면 첫 저장으로 보고 PIN 없이 허용 */
export async function POST(request: Request) {
  const kv = await getKV();
  if (!kv) return NextResponse.json({ error: "KV not configured" }, { status: 503 });
  try {
    const body = (await request.json()) as { pin?: string; config?: AppConfig };
    const { pin, config } = body;
    if (!config?.settings || !config?.products) return NextResponse.json({ error: "Invalid config" }, { status: 400 });

    const current = await kv.get<string>(KV_KEY);
    const currentConfig = current
      ? (typeof current === "string" ? (JSON.parse(current) as AppConfig) : current)
      : null;

    if (currentConfig?.settings) {
      const savedPin = currentConfig.settings.loginPin ?? "";
      if (savedPin !== (pin ?? "")) {
        return NextResponse.json({ error: "PIN mismatch" }, { status: 401 });
      }
    }

    await kv.set(KV_KEY, JSON.stringify(config));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/config] POST error:", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
