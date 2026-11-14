import type { AppConfig, ConfigMeta } from "./types";

export function readConfigMeta(config: AppConfig | null | undefined): ConfigMeta {
  const meta = config?.configMeta;
  const revision =
    meta && typeof meta.revision === "number" && Number.isFinite(meta.revision) && meta.revision >= 0
      ? Math.floor(meta.revision)
      : 0;
  const updatedAt = meta && typeof meta.updatedAt === "string" && meta.updatedAt !== "" ? meta.updatedAt : null;
  return { revision, updatedAt };
}

/**
 * 저장 성공 시에만 호출한다.
 * 클라이언트가 보낸 configMeta는 무시하고, 서버에 이미 있던 버전만 1 올린다.
 */
export function withNextRevision(config: AppConfig, previous: AppConfig | null, now = new Date()): AppConfig {
  const prev = readConfigMeta(previous);
  return {
    ...config,
    configMeta: {
      revision: prev.revision + 1,
      updatedAt: now.toISOString(),
    },
  };
}
