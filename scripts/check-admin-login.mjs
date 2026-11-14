const src = await import("node:fs").then((m) => m.readFileSync("src/server/defaultAdminPin.ts", "utf8"));
const match = src.match(/"([0-9]{4})"/);
if (!match) {
  console.log("PIN_SOURCE_MISSING");
  process.exit(1);
}
const pin = match[1];
const login = await fetch("http://localhost:3010/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ pin }),
});
const cookie = login.headers.getSetCookie?.() ?? [];
const raw = login.headers.get("set-cookie") ?? "";
const httpOnly = raw.toLowerCase().includes("httponly");
console.log("LOGIN", login.status, httpOnly ? "COOKIE_HTTPONLY" : "COOKIE_NOT_HTTPONLY");
const token = raw.split(";")[0];
const admin = await fetch("http://localhost:3010/api/admin/config", {
  headers: { cookie: token },
});
const body = await admin.json();
const hasPin = typeof body?.config?.settings?.loginPin === "string" && body.config.settings.loginPin.length > 0;
console.log("ADMIN_CONFIG", admin.status, hasPin ? "PIN_PRESENT_FOR_ADMIN" : "PIN_MISSING");
console.log("PRICE_UNCHANGED", body?.config?.settings?.popSellPerM4, body?.config?.settings?.minStickerSupply);
console.log("SOURCE", body?.source, "REVISION", body?.revision);
if (cookie.length === 0 && !raw) console.log("COOKIE_HEADER_MISSING");
