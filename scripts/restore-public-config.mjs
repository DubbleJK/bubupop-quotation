/**
 * backups/quotation-config-public.json 을 KV 설정 키에 되돌리는 스크립트.
 * 기본 실행은 KV에 접속하지 않는다.
 * 실제로 쓰려면 ALLOW_KV_RESTORE=1 이 필요하다. 운영 반영 전에는 실행하지 않는다.
 * 백업에는 PIN이 없다. 현재 KV 레코드의 PIN은 유지한다.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

if (process.env.ALLOW_KV_RESTORE !== "1") {
  console.log("Restore did not contact KV. Set ALLOW_KV_RESTORE=1 only for an intentional write.");
  process.exit(0);
}

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.log("KV credentials are missing. Nothing was written.");
  process.exit(1);
}

const file = path.join(process.cwd(), "backups", "quotation-config-public.json");
const backup = JSON.parse(await readFile(file, "utf8"));
const { kv } = await import("@vercel/kv");
const currentRaw = await kv.get("quotation_admin_config");
const current = currentRaw == null ? null : typeof currentRaw === "string" ? JSON.parse(currentRaw) : currentRaw;
const keptPin = current?.settings?.loginPin;
const next = {
  ...backup,
  settings: {
    ...backup.settings,
    ...(typeof keptPin === "string" && keptPin !== "" ? { loginPin: keptPin } : {}),
  },
};
await kv.set("quotation_admin_config", JSON.stringify(next));
console.log("Restored public price fields. Existing auth secret was kept when present.");
