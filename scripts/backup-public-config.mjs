/**
 * 운영 KV에 있는 견적 설정을 읽기만 해서, 인증 비밀값을 뺀 JSON으로 저장한다.
 * 자격 증명이 없으면 네트워크 호출을 하지 않고 종료한다.
 * 이 스크립트는 KV에 쓰지 않는다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const lowered = key.toLowerCase();
      if (
        lowered === "loginpin" ||
        lowered.includes("token") ||
        lowered.includes("secret") ||
        lowered.includes("password")
      ) {
        continue;
      }
      out[key] = stripSecrets(child);
    }
    return out;
  }
  return value;
}

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.log("KV credentials are not set. No network call was made. Backup skipped.");
  process.exit(0);
}

const { kv } = await import("@vercel/kv");
const raw = await kv.get("quotation_admin_config");
if (raw == null) {
  console.log("KV responded and the config key is empty. No file written.");
  process.exit(0);
}

const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
const safe = stripSecrets(parsed);
const dir = path.join(process.cwd(), "backups");
await mkdir(dir, { recursive: true });
const file = path.join(dir, "quotation-config-public.json");
await writeFile(file, JSON.stringify(safe, null, 2), "utf8");
console.log("Wrote a public backup with auth secrets removed.");
console.log(file);
