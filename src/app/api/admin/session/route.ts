import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, readSession } from "@/server/adminSession";

export async function GET(request: NextRequest) {
  const session = readSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, role: session.role });
}
