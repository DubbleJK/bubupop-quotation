import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "quotation_admin_session";
const DEV_FALLBACK_SECRET = "dev-only-quotation-admin-session";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** 프로덕션에서는 ADMIN_SESSION_SECRET(16자 이상)이 있어야 세션을 발급한다. */
export function sessionSecret(): string | null {
  const env = process.env["ADMIN_SESSION_SECRET"];
  if (typeof env === "string" && env.length >= 16) return env;
  if (process.env.NODE_ENV === "production") return null;
  return DEV_FALLBACK_SECRET;
}

export function signAdminSession(now = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = now + MAX_AGE_MS;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${exp}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expRaw, nonce, sig] = parts;
  if (!expRaw || !nonce || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return false;
  const payload = `${expRaw}.${nonce}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
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
