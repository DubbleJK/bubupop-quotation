import fs from "node:fs";

const src = fs.readFileSync("src/server/defaultAdminPin.ts", "utf8");
const match = src.match(/"([0-9]{4})"/);
if (!match) {
  console.log("PIN_SOURCE_MISSING");
  process.exit(1);
}
const login = await fetch("http://localhost:3010/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ pin: match[1] }),
});
const raw = login.headers.get("set-cookie") ?? "";
const cookie = raw.split(";")[0];
const admin = await fetch("http://localhost:3010/api/admin/config", { headers: { cookie } });
const adminBody = await admin.json();
const save = await fetch("http://localhost:3010/api/config", {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ config: adminBody.config }),
});
const body = await save.json();
const leaked = JSON.stringify(body).toLowerCase().includes("loginpin");
console.log("SAVE", save.status, body.persisted ?? "none", body.error ?? "ok", leaked ? "RESPONSE_HAS_PIN" : "RESPONSE_NO_PIN");
