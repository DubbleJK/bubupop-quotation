/**
 * 싱글톤 provider. V1은 localProvider, V2에서는 apiProvider로 교체.
 */
import { localProvider } from "./localProvider";
import type { ConfigProvider } from "./provider";

export const configProvider: ConfigProvider = localProvider;
export type { ConfigProvider } from "./provider";
export type { AppConfig } from "./types";
