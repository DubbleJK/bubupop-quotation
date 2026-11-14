/**
 * 싱글톤 provider.
 */
import { localProvider } from "./localProvider";
import type { ConfigProvider } from "./provider";

export const configProvider: ConfigProvider = localProvider;
export type { ConfigProvider } from "./provider";
export type { AppConfig } from "./types";
export type { QuoteConfigResolution, ConfigSource } from "./resolveQuoteConfig";
export { describeQuoteSource } from "./resolveQuoteConfig";
