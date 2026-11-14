import { NextResponse } from "next/server";
import { readConfigMeta } from "@/lib/config/configMeta";
import { kvCredentialsPresent, readKvConfig } from "@/server/kvConfig";

/**
 * KV 연결 여부만 확인한다.
 * 자격 증명이 없으면 네트워크 호출을 하지 않는다.
 * 가격과 인증 비밀값은 반환하지 않는다.
 */
export async function GET() {
  if (!kvCredentialsPresent()) {
    return NextResponse.json({
      kvConfigured: false,
      reachable: false,
      hasStoredConfig: false,
      revision: null,
      updatedAt: null,
    });
  }

  const stored = await readKvConfig();
  if (stored.state === "error") {
    return NextResponse.json(
      { kvConfigured: true, reachable: false, hasStoredConfig: false, revision: null, updatedAt: null },
      { status: 503 }
    );
  }
  if (stored.state === "ok") {
    const meta = readConfigMeta(stored.config);
    return NextResponse.json({
      kvConfigured: true,
      reachable: true,
      hasStoredConfig: true,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
    });
  }
  return NextResponse.json({
    kvConfigured: true,
    reachable: true,
    hasStoredConfig: false,
    revision: null,
    updatedAt: null,
  });
}
