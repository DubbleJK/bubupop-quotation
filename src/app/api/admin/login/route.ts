import { NextRequest, NextResponse } from "next/server";
import { readKvConfig } from "@/server/kvConfig";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  pinsMatch,
  sessionSecret,
  signSession,
  type SessionRole,
} from "@/server/adminSession";
import { defaultAdminPin } from "@/server/defaultAdminPin";
import { readStaffPin } from "@/server/staffAccess";

export async function POST(request: NextRequest) {
  if (!sessionSecret()) {
    return NextResponse.json({ error: "session_secret_missing" }, { status: 503 });
  }

  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const stored = await readKvConfig();
  if (stored.state === "error") {
    return NextResponse.json({ error: "config_unreadable" }, { status: 503 });
  }

  const storedPin = stored.state === "ok" ? stored.config.settings.loginPin : undefined;
  const expected = storedPin && storedPin !== "" ? storedPin : defaultAdminPin;
  let role: SessionRole | null = pinsMatch(expected, pin) ? "admin" : null;
  if (!role) {
    const staffPin = await readStaffPin();
    if (staffPin && pinsMatch(staffPin, pin)) role = "staff";
  }
  if (!role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = signSession(role);
  if (!token) {
    return NextResponse.json({ error: "session_secret_missing" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(ADMIN_COOKIE_NAME, token, adminCookieOptions());
  return res;
}
