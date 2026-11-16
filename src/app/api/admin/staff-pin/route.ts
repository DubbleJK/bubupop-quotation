import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/requireAdmin";
import { readStaffPin, writeStaffPin } from "@/server/staffAccess";

/** 직원 PIN이 저장돼 있는지만 알려 준다. 값 자체는 돌려주지 않는다. */
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const pin = await readStaffPin();
  return NextResponse.json({ configured: Boolean(pin) });
}

/** 관리자가 직접 입력한 PIN만 저장한다. 서버가 PIN을 만들지 않는다. */
export async function PUT(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "invalid_pin" }, { status: 400 });
  }
  const written = await writeStaffPin(pin);
  if (!written.ok) return NextResponse.json({ error: written.reason }, { status: 503 });
  return NextResponse.json({ ok: true, configured: true });
}
