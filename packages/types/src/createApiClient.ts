/**
 * OpenAPI 型に基づく型安全 API クライアントのファクトリ。
 * openapi.json → api.generated.ts の paths を使い、エンドポイント変更は型エラーで検知される。
 */

import createClient from "openapi-fetch";
import type { paths } from "./api.generated";

export type ApiClient = ReturnType<typeof createClient<paths>>;

export interface CreateApiClientOptions {
  baseUrl: string;
  headers?: HeadersInit;
  /** テストで fetch を差し替える場合に指定 */
  fetch?: typeof fetch;
}

/**
 * 型安全な API クライアントを生成する。
 * Scout / Admin では baseUrl と headers（API キー等）を渡して利用する。
 * テスト時は options.fetch にモックを渡すと download 系のテストが通る。
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, headers, fetch: customFetch } = options;
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ""),
    ...(headers && { headers }),
    ...(customFetch && { fetch: customFetch }),
  });
}

/**
 * 環境変数 URL (あれば)、または window.location を元に API のベース URL を組み立てる。
 * フロントエンドからの API 呼び出しでは、この関数をベース URL 解決の SSOT として利用する。
 * @param envUrl import.meta.env.VITE_API_URL などを渡す
 */
export function getApiBaseUrl(envUrl?: string): string {
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}
