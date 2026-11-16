import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "quotation_admin_session";
const DEV_FALLBACK_SECRET = "dev-only-quotation-admin-session";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** 프로덕션에서는 16자 이상인 세션 비밀값이 실행 시점에 있어야 로그인 세션을 발급한다. */
export function sessionSecret(): string | null {
  const env = process.env["ADMIN_SESSION_SECRET"];
  if (typeof env === "string" && env.length >= 16) return env;
  if (process.env.NODE_ENV === "production") return null;
  return DEV_FALLBACK_SECRET;
}

export type SessionRole = "admin" | "staff";

export interface SessionClaims {
  role: SessionRole;
}

/** 역할이 없는 기존 세션은 관리자로 유지한다. 직원 접근을 갑자기 끊지 않기 위해서다. */
export function signSession(role: SessionRole, now = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = now + MAX_AGE_MS;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${exp}.${nonce}.${role}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function signAdminSession(now = Date.now()): string | null {
  return signSession("admin", now);
}

export function readSession(token: string | undefined, now = Date.now()): SessionClaims | null {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const parts = token.split(".");
  let payload = "";
  let sig = "";
  let role: SessionRole = "admin";
  if (parts.length === 3) {
    const [expRaw, nonce, signature] = parts;
    if (!expRaw || !nonce || !signature) return null;
    payload = `${expRaw}.${nonce}`;
    sig = signature;
    role = "admin";
    if (!fresh(expRaw, now)) return null;
  } else if (parts.length === 4) {
    const [expRaw, nonce, rawRole, signature] = parts;
    if (!expRaw || !nonce || !signature) return null;
    if (rawRole !== "admin" && rawRole !== "staff") return null;
    payload = `${expRaw}.${nonce}.${rawRole}`;
    sig = signature;
    role = rawRole;
    if (!fresh(expRaw, now)) return null;
  } else {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null;
  return { role };
}

function fresh(expRaw: string, now: number): boolean {
  const exp = Number(expRaw);
  return Number.isFinite(exp) && exp >= now;
}

export function verifyAdminSession(token: string | undefined, now = Date.now()): boolean {
  return readSession(token, now)?.role === "admin";
}

export function verifyQuoteSession(token: string | undefined, now = Date.now()): boolean {
  return readSession(token, now) != null;
}

export function pinsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  };
}
