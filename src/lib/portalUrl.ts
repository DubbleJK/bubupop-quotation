/**
 * 부부계산 포털 URL (홈으로 가기 링크용).
 * 환경 변수 NEXT_PUBLIC_PORTAL_URL이 있으면 사용,
 * 없으면 개발 시 localhost, 프로덕션 시 배포된 포털 기본 URL 사용.
 */
const ENV_URL =
  typeof process.env.NEXT_PUBLIC_PORTAL_URL === "string" && process.env.NEXT_PUBLIC_PORTAL_URL !== ""
    ? process.env.NEXT_PUBLIC_PORTAL_URL
    : "";

const DEFAULT_DEV = "http://localhost:3001";
const DEFAULT_PROD = "https://bubupop-portal.vercel.app";

export const PORTAL_URL =
  ENV_URL !== "" ? ENV_URL : process.env.NODE_ENV === "development" ? DEFAULT_DEV : DEFAULT_PROD;
