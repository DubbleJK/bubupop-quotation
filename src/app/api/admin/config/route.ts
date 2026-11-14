import { NextRequest, NextResponse } from "next/server";
import { getFileConfig } from "@/lib/config/fileConfig";
import { readConfigMeta } from "@/lib/config/configMeta";
import { readKvConfig } from "@/server/kvConfig";
import { ADMIN_COOKIE_NAME, verifyAdminSession } from "@/server/adminSession";
import { defaultAdminPin } from "@/server/defaultAdminPin";

/** 로그인한 관리자만 인증값을 포함한 설정을 받는다. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSession(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stored = await readKvConfig();
  if (stored.state === "error") {
    return NextResponse.json({ error: "config_unreadable" }, { status: 503 });
  }

  if (stored.state === "ok") {
    const pin = stored.config.settings.loginPin && stored.config.settings.loginPin !== ""
      ? stored.config.settings.loginPin
      : defaultAdminPin;
    const config = {
      ...stored.config,
      settings: { ...stored.config.settings, loginPin: pin },
    };
    const meta = readConfigMeta(config);
    return NextResponse.json({
      config,
      source: "server",
      revision: meta.revision,
      updatedAt: meta.updatedAt,
    });
  }

  const file = getFileConfig();
  return NextResponse.json({
    config: {
      ...file,
      settings: { ...file.settings, loginPin: defaultAdminPin },
    },
    source: "default",
    revision: 0,
    updatedAt: null,
  });
}
