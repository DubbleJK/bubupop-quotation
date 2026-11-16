import { NextRequest, NextResponse } from "next/server";
import type { AppConfig } from "@/lib/config/types";
import { normalizeConfig } from "@/lib/config/fileConfig";
import { toPublicConfig } from "@/lib/config/publicConfig";
import { readConfigMeta, withNextRevision } from "@/lib/config/configMeta";
import { readKvConfig, writeKvConfig } from "@/server/kvConfig";
import { requireAdmin } from "@/server/requireAdmin";
import { defaultAdminPin } from "@/server/defaultAdminPin";

/** 공개 견적 설정. 인증 비밀값은 포함하지 않는다. */
export async function GET() {
  const stored = await readKvConfig();
  if (stored.state === "unconfigured" || stored.state === "empty") {
    return NextResponse.json({ code: "absent" }, { status: 404 });
  }
  if (stored.state === "error") {
    return NextResponse.json({ code: "unavailable" }, { status: 503 });
  }
  return NextResponse.json(toPublicConfig(stored.config));
}

/** 관리자 세션이 있을 때만 서버에 저장한다. 실패하면 아무 곳에도 쓰지 않는다. */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let config: AppConfig | undefined;
  try {
    const body = (await request.json()) as { config?: AppConfig };
    config = body.config;
  } catch {
    return NextResponse.json({ error: "invalid_body", persisted: "none" }, { status: 400 });
  }
  if (!config?.settings || !config?.products) {
    return NextResponse.json({ error: "invalid_config", persisted: "none" }, { status: 400 });
  }

  const stored = await readKvConfig();
  if (stored.state === "error") {
    return NextResponse.json({ error: "config_unreadable", persisted: "none" }, { status: 503 });
  }

  const previous = stored.state === "ok" ? stored.config : null;
  const incomingPin = typeof config.settings.loginPin === "string" ? config.settings.loginPin.trim() : "";
  let keptPin = defaultAdminPin;
  if (incomingPin !== "") {
    keptPin = incomingPin;
  } else if (previous?.settings.loginPin) {
    keptPin = previous.settings.loginPin;
  }

  const normalized = normalizeConfig(config);
  const next = withNextRevision(
    {
      ...normalized,
      settings: { ...normalized.settings, loginPin: keptPin },
    },
    previous
  );

  const written = await writeKvConfig(next);
  if (!written.ok) {
    return NextResponse.json({ error: written.reason, persisted: "none" }, { status: 503 });
  }

  const meta = readConfigMeta(next);
  return NextResponse.json({
    ok: true,
    persisted: "server",
    revision: meta.revision,
    updatedAt: meta.updatedAt,
    publicConfig: toPublicConfig(next),
  });
}
