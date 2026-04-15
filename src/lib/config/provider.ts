import type { AppConfig } from "./types";

/**
 * V2 업그레이드: API/DB에서 설정을 가져올 때 이 인터페이스만 바꾸면 됨.
 * UI와 calc는 ConfigProvider를 통해서만 설정을 사용.
 */
export interface ConfigProvider {
  /** 초기 렌더링용 동기 설정 (SSR/CSR 모두 안전한 기본값) */
  getInitialConfig(): AppConfig;
  getAllConfig(): Promise<AppConfig>;
  /** 기본값 복원 시 사용할 설정 (저장된 기본값 있으면 그대로, 없으면 코드 기본값) */
  getDefaultConfig(): Promise<AppConfig>;
}
