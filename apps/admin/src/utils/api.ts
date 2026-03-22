/**
 * API クライアント。openapi-fetch ベースの apiClient と、SWR 用のフェッチャー関数を提供。
 * ベース URL の解決は @citadel/types の getApiBaseUrl を SSOT とし、ここではヘッダー付与など
 * Admin 固有の処理に集中させる。
 */

import { createApiClient, getApiBaseUrl as sharedGetApiBaseUrl } from "@citadel/types";
import type { components } from "@citadel/types";

import type { GridResponse } from "@/features/drafting/types";

/** GET /api/missions の1件の型 */
export interface MissionItem {
  missionId: string;
  permission: string;
  reportIds?: string[];
  heartbeatAt?: string | null;
  expiresAt?: string | null;
  issuedAt?: string;
  status?: string;
  deviceId?: string | null;
}

/** GET /api/demo/status のレスポンス型 */
export interface DemoStatus {
  has_demo_data: boolean;
  total: number;
  counts: {
    companies: number;
    workers: number;
    instruments: number;
    parts: number;
    owned_instruments: number;
    reports: number;
  };
}

/** GET /api/templates の1件の型 */
export interface TemplateItem {
  id: string;
  name: string;
  filePath: string;
  fileExists: boolean;
}

/** GET /api/report-formats の1件の型 */
export interface ReportFormatItem {
  id: string;
  name: string;
}

/** GET /api/report-formats/{id}/templates の1件の型 */
export interface FormatTemplateItem {
  id?: string;
  templateId: string;
  name?: string;
  filePath?: string | null;
  sortOrder?: number | null;
}

/** GET /api/templates/scan のレスポンス型 */
export interface TemplateScanResultItem {
  inconsistent: boolean;
  newFiles: string[];
  missingFromDisk: { id?: string; filePath?: string }[];
}

/** POST /api/templates/auto-generate のレスポンス型 */
export type TemplateAutoGenerateResponse = components["schemas"]["TemplateAutoGenerateResponse"];

const API_KEY = import.meta.env.VITE_API_KEY_ADMIN ?? "";

export function getApiBaseUrl(): string {
  return sharedGetApiBaseUrl(import.meta.env.VITE_API_URL);
}

export function getScoutBaseUrl(): string {
  if (import.meta.env.VITE_SCOUT_URL) {
    return String(import.meta.env.VITE_SCOUT_URL).replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return "http://localhost:3000";
}

function buildHeaders(omitContentType = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (!omitContentType) headers["Content-Type"] = "application/json";
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  return headers;
}

function buildHeadersForClient(): Headers {
  const h = buildHeaders();
  return h instanceof Headers ? h : new Headers(h);
}

let _apiClient: ReturnType<typeof createApiClient> | null = null;
function getApiClient(): ReturnType<typeof createApiClient> {
  if (!_apiClient) {
    const baseUrl = getApiBaseUrl() || "http://localhost:8000";
    _apiClient = createApiClient({
      baseUrl,
      headers: buildHeadersForClient(),
      fetch: typeof globalThis !== "undefined" ? globalThis.fetch : undefined,
    });
  }
  return _apiClient;
}

/** 型安全 API クライアント（初回アクセス時に生成。テストでは beforeEach で fetch をスタブしてから利用すること） */
export const apiClient = new Proxy({} as ReturnType<typeof createApiClient>, {
  get(_, prop) {
    return getApiClient()[prop as keyof ReturnType<typeof createApiClient>];
  },
});

/**
 * openapi-fetch のレスポンスを検証・アンラップする共通ヘルパー。
 * 成功時は data を返し、error がある場合は throw する。
 */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  const res = await promise;
  if (res.error) {
    throw new Error(typeof res.error === "object" ? JSON.stringify(res.error) : String(res.error));
  }
  return res.data as T;
}

function throwOnError<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error) {
    const msg =
      typeof res.error === "object" && res.error !== null && "detail" in res.error
        ? String((res.error as { detail?: unknown }).detail)
        : `HTTP ${res.response.status}: ${res.response.statusText}`;
    throw new Error(msg);
  }
  return (res.data ?? null) as T;
}

/**
 * SWR 用の汎用フェッチャー。
 * - キーとして渡された URL 文字列を openapi-fetch の GET にそのまま渡し、エラー時は throw する。
 * - 既存の fetchXxx 関数は段階的にこのフェッチャー経由に寄せていく。
 */
export async function swrFetcher<T>(url: string): Promise<T> {
  const res = await getApiClient().GET(url as never, {} as never);
  return throwOnError<T>(res);
}

/** SWR 用: 任務一覧（status 指定時はその状態のみ） */
export async function fetchMissions(status?: string): Promise<MissionItem[]> {
  return throwOnError(
    await getApiClient().GET("/api/missions", {
      params: { query: status ? { status } : undefined },
    })
  ) as MissionItem[];
}

/** SWR 用: テンプレートグリッド取得 */
export async function fetchTemplateGrid(templateId: string): Promise<GridResponse> {
  return throwOnError(
    await getApiClient().GET("/api/templates/{template_id}/grid", {
      params: { path: { template_id: templateId } },
    })
  ) as GridResponse;
}

/** 指定レポート種別のテンプレート構成 */
export async function fetchReportFormatTemplates(formatId: string): Promise<FormatTemplateItem[]> {
  return throwOnError(
    await getApiClient().GET("/api/report-formats/{format_id}/templates", {
      params: { path: { format_id: formatId } },
    })
  ) as FormatTemplateItem[];
}

/**
 * AI によるテンプレート自動生成。file と name を FormData で POST し、成功時は template と report を返す。
 * multipart/form-data 送信時は Content-Type を付与しないこと（ブラウザが boundary 付きで設定する）。
 * デフォルトの getApiClient() は Content-Type: application/json を付けるため、本リクエスト専用に
 * Content-Type を省略したクライアントを使う。
 */
export async function autoGenerateTemplate(
  file: File,
  name: string
): Promise<TemplateAutoGenerateResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  const multipartClient = createApiClient({
    baseUrl: getApiBaseUrl() || "http://localhost:8000",
    headers: buildHeaders(true),
    fetch: typeof globalThis !== "undefined" ? globalThis.fetch : undefined,
  });
  const res = await multipartClient.POST("/api/templates/auto-generate", {
    body: {} as { file: string; name: string },
    bodySerializer: () => formData,
  });
  if (res.error) {
    const detail =
      typeof res.error === "object" && res.error !== null && "detail" in res.error
        ? String((res.error as { detail?: unknown }).detail)
        : `HTTP ${res.response.status}: ${res.response.statusText}`;
    throw new Error(detail);
  }
  return res.data as TemplateAutoGenerateResponse;
}

/**
 * PDF 生成 API を呼び出し、Blob をダウンロード。
 * usePrinter: true のとき Microsoft Print to PDF で高画質出力。
 */
type FetchResult = { data?: unknown; error?: unknown; response: Response };

export async function downloadPdf(reportId: string, usePrinter: boolean = false): Promise<void> {
  const res = (await apiClient.POST("/api/generate-report", {
    params: { query: { report_id: reportId, use_printer: usePrinter } },
    parseAs: "blob",
  })) as FetchResult;
  if (res.error) {
    const detail =
      typeof res.error === "object" &&
      res.error !== null &&
      "detail" in (res.error as { detail?: unknown })
        ? String((res.error as { detail?: unknown }).detail)
        : `HTTP ${res.response.status}: ${res.response.statusText}`;
    throw new Error(detail);
  }
  const blob = new Blob([res.data as Blob], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report_${reportId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Excel ZIP 生成 API を呼び出し、ZIP をダウンロード。
 */
export async function downloadExcelZip(reportId: string): Promise<void> {
  const res = (await apiClient.POST("/api/generate-excel", {
    params: { query: { report_id: reportId } },
    parseAs: "blob",
  })) as FetchResult;
  if (res.error) {
    const detail =
      typeof res.error === "object" &&
      res.error !== null &&
      "detail" in (res.error as { detail?: unknown })
        ? String((res.error as { detail?: unknown }).detail)
        : `HTTP ${res.response.status}: ${res.response.statusText}`;
    throw new Error(detail);
  }
  const blob = new Blob([res.data as Blob], { type: "application/zip" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report_${reportId}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** レポート削除。DELETE /api/reports/{report_id} */
export async function deleteReport(reportId: string): Promise<void> {
  const res = (await apiClient.DELETE("/api/reports/{report_id}", {
    params: { path: { report_id: reportId } },
  })) as FetchResult;
  if (res.error && res.response.status !== 404) {
    throw new Error(`削除に失敗しました: ${res.response.status}`);
  }
}
