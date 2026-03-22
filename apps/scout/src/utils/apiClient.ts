/**
 * API クライアント（openapi-fetch ベース・型安全）。
 * API キー・バージョンヘッダを付与し、426 時は再読み込みイベント発火、応答からサーバー時刻オフセットを更新する。
 */

import { createApiClient, getApiBaseUrl as sharedGetApiBaseUrl } from "@citadel/types";
import {
  CLIENT_VERSION,
  CLIENT_VERSION_REQUIRED_EVENT,
  type ClientVersionRequiredDetail,
} from "@/constants/clientVersion";
import { updateServerTimeOffsetFromResponse } from "./serverTimeOffset";

const API_KEY = import.meta.env.VITE_API_KEY_SCOUT ?? "";

export function getApiBaseUrl(): string {
  return sharedGetApiBaseUrl(import.meta.env.VITE_API_URL);
}

export function getDefaultHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Client-Version": CLIENT_VERSION,
  };
  if (API_KEY) {
    (headers as Record<string, string>)["X-API-Key"] = API_KEY;
  }
  return headers;
}

async function scoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string"
      ? input.startsWith("http")
        ? input
        : `${getApiBaseUrl()}${input}`
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = init?.method?.toUpperCase() || "GET";
  const headers = new Headers(init?.headers);
  if (API_KEY) headers.set("X-API-Key", API_KEY);
  headers.set("X-Client-Version", CLIENT_VERSION);
  if (method !== "GET" && method !== "DELETE") {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });

  if (response.status === 426) {
    let minVersion = "";
    let message = "アプリの更新が必要です。ページを再読み込みしてください。";
    try {
      const body = (await response
        .clone()
        .json()
        .catch(() => ({}))) as {
        minVersion?: string;
        detail?: string;
      };
      minVersion = body.minVersion ?? "";
      if (body.detail) message = body.detail;
    } catch {
      // ignore
    }
    const detail: ClientVersionRequiredDetail = { minVersion, message };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CLIENT_VERSION_REQUIRED_EVENT, { detail }));
    }
    throw new Error(message);
  }

  updateServerTimeOffsetFromResponse(response);
  return response;
}

/** 型安全 API クライアント（全リクエストに API キー・バージョン・426 処理・サーバー時刻更新を適用） */
export const apiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  headers: getDefaultHeaders(),
  fetch: scoutFetch,
});
