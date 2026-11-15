import fs from "fs";
import path from "path";

/** 개발 서버에서만 파일을 쓴다. 운영 환경과 테스트에서는 켜지지 않는다. */
export function devFileStoreEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "development";
}

export function costPersistence(kvConfigured: boolean, nodeEnv = process.env.NODE_ENV): "kv" | "dev-file" | "none" {
  if (kvConfigured) return "kv";
  if (devFileStoreEnabled(nodeEnv)) return "dev-file";
  return "none";
}

function devFile(name: string): string {
  return path.join(process.cwd(), ".data", name);
}

export function devStoreDir(): string {
  return path.join(process.cwd(), ".data");
}

export function readDevJson(name: string): { state: "empty" } | { state: "ok"; value: unknown } | { state: "error" } {
  try {
    const file = devFile(name);
    if (!fs.existsSync(file)) return { state: "empty" };
    return { state: "ok", value: JSON.parse(fs.readFileSync(file, "utf8")) as unknown };
  } catch {
    return { state: "error" };
  }
}

export function writeDevJson(name: string, value: unknown): { ok: true } | { ok: false; reason: "error" } {
  try {
    const file = devFile(name);
    fs.mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
