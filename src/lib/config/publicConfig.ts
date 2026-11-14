import type { AppConfig } from "./types";
import { cloneConfig } from "./fileConfig";

/** 견적 화면과 공개 API에 내려가는 설정. 인증 비밀값은 제거한다. */
export function toPublicConfig(config: AppConfig): AppConfig {
  const next = cloneConfig(config);
  const settings = { ...next.settings };
  delete settings.loginPin;
  next.settings = settings;
  return next;
}

export function containsLoginPin(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const settings = (config as { settings?: { loginPin?: unknown } }).settings;
  return typeof settings?.loginPin === "string";
}
