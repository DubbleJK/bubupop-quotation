import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, readSession } from "@/server/adminSession";

export function requireAdmin(request: NextRequest): NextResponse | null {
  const session = readSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

/** 견적 계산과 기록. 직원과 관리자 모두 허용하고, 원가 수정은 허용하지 않는다. */
export function requireQuoteAccess(request: NextRequest): NextResponse | null {
  const session = readSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
