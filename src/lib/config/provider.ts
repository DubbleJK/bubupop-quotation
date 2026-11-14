import type { AppConfig } from "./types";
import type { QuoteConfigResolution } from "./resolveQuoteConfig";

/**
 * UI와 calc는 ConfigProvider를 통해서만 설정을 사용한다.
 */
export interface ConfigProvider {
  /** 서버 확인 전의 코드 기본값. 브라우저 저장 견적 설정은 읽지 않는다. */
  getInitialConfig(): AppConfig;
  /** 서버 응답을 기다린 뒤 견적에 쓸 설정을 확정한다. */
  loadQuoteConfig(): Promise<QuoteConfigResolution>;
  getAllConfig(): Promise<AppConfig>;
  /** 서버 저장이 성공한 공개 설정만 이 브라우저 캐시에 반영한다. */
  rememberServerConfig(config: AppConfig): void;
  /** 기본값 복원 템플릿. 인증 비밀값은 제외한다. */
  getDefaultConfig(): Promise<AppConfig>;
}
