/**
 * 同期ダウンロード（delta / full）の通信と DB マージ。
 * 状態は持たず、呼び出し元（useSyncDownload）が状態を管理する。
 */

import type { DatabaseSchema } from "@citadel/types";
import { TABLE_KEYS } from "@citadel/types";
import { isNetworkError } from "@citadel/monitoring";
import { db } from "@/db/db";
import { apiClient, getApiBaseUrl, getDefaultHeaders } from "@/utils/apiClient";

/** delta API のレスポンス（_meta 付き） */
export interface DeltaResponse extends Partial<DatabaseSchema> {
  _meta?: { syncedAt?: string; reportCount?: number };
}

/** download API のレスポンス（各キーが配列） */
export type FullResponse = DatabaseSchema;

/**
 * 差分同期用データを取得。DB は触らない。
 */
export async function fetchDelta(since: string, includeMaster: boolean): Promise<DeltaResponse> {
  const res = (await apiClient.GET("/api/sync/delta", {
    params: { query: { since, include_master: includeMaster } },
  })) as { data?: unknown; error?: unknown; response: Response };
  if (res.error != null) {
    throw new Error(`サーバーエラー (${res.response.status}): ${JSON.stringify(res.error)}`);
  }
  return (res.data ?? {}) as DeltaResponse;
}

/**
 * フル同期用データを取得。DB は触らない。
 */
export async function fetchFull(): Promise<FullResponse> {
  const res = (await apiClient.GET("/api/sync/download")) as {
    data?: unknown;
    error?: unknown;
    response: Response;
  };
  if (res.error != null) {
    throw new Error(`サーバーエラー (${res.response.status}): ${JSON.stringify(res.error)}`);
  }
  return (res.data ?? {}) as FullResponse;
}

/** NDJSON 1行の形式（テーブルチャンク） */
interface NdjsonTableChunk {
  table?: string;
  rows?: unknown[];
}

/** Delta ストリーム末尾のメタ行 */
interface NdjsonMetaChunk {
  type: "meta";
  syncType?: string;
  since?: string;
  syncedAt?: string;
  reportCount?: number;
}

const TABLE_KEYS_SET = new Set<string>(TABLE_KEYS);

/**
 * ストリームを改行区切りで読み、1行ずつ JSON パースしてコールバックに渡す。
 * 途中切断時はパースエラーを投げる。onLine が Promise を返す場合は await する。
 */
async function readNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (obj: NdjsonTableChunk | NdjsonMetaChunk) => void | Promise<void>
): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    // eslint-disable-next-line no-constant-condition -- stream read loop
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        let obj: NdjsonTableChunk | NdjsonMetaChunk;
        try {
          obj = JSON.parse(trimmed) as NdjsonTableChunk | NdjsonMetaChunk;
        } catch (e) {
          throw new Error(
            `NDJSON パースエラー: ${e instanceof Error ? e.message : String(e)} (行: ${trimmed.slice(0, 80)}...)`
          );
        }
        await onLine(obj);
      }
    }
    if (buffer.trim() !== "") {
      let obj: NdjsonTableChunk | NdjsonMetaChunk;
      try {
        obj = JSON.parse(buffer.trim()) as NdjsonTableChunk | NdjsonMetaChunk;
      } catch (e) {
        throw new Error(`NDJSON 最終行パースエラー: ${e instanceof Error ? e.message : String(e)}`);
      }
      await onLine(obj);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * フル同期をストリームで取得し、受け取りながら IndexedDB にマージする。
 * 先に全テーブルをクリアしてから、行ごとに bulkPut する。
 */
export async function fetchAndMergeFullStream(): Promise<void> {
  const url = `${getApiBaseUrl()}/api/sync/download/stream`;
  const response = await fetch(url, {
    method: "GET",
    headers: getDefaultHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`サーバーエラー (${response.status}): ${text}`);
  }
  const body = response.body;
  if (!body) throw new Error("ストリーム body がありません");

  await db.transaction("rw", TABLE_KEYS, async () => {
    await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
  });

  const reader = body.getReader();
  await readNdjsonStream(reader, async (obj) => {
    const chunk = obj as NdjsonTableChunk;
    if (chunk.table != null && Array.isArray(chunk.rows) && TABLE_KEYS_SET.has(chunk.table)) {
      await db.table(chunk.table as keyof DatabaseSchema).bulkPut(chunk.rows);
    }
  });
}

export interface DeltaStreamMeta {
  syncedAt?: string;
  reportCount?: number;
}

/**
 * 差分同期をストリームで取得し、受け取りながら IndexedDB にマージする。
 * メタ行（type: "meta"）の内容を返す。
 */
export async function fetchAndMergeDeltaStream(
  since: string,
  includeMaster: boolean
): Promise<DeltaStreamMeta> {
  const params = new URLSearchParams({
    since,
    include_master: String(includeMaster),
  });
  const url = `${getApiBaseUrl()}/api/sync/delta/stream?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: getDefaultHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`サーバーエラー (${response.status}): ${text}`);
  }
  const body = response.body;
  if (!body) throw new Error("ストリーム body がありません");

  let meta: DeltaStreamMeta = {};
  const reader = body.getReader();
  await readNdjsonStream(reader, async (obj) => {
    if ((obj as NdjsonMetaChunk).type === "meta") {
      const m = obj as NdjsonMetaChunk;
      meta = { syncedAt: m.syncedAt, reportCount: m.reportCount };
      return;
    }
    const chunk = obj as NdjsonTableChunk;
    if (chunk.table != null && Array.isArray(chunk.rows) && TABLE_KEYS_SET.has(chunk.table)) {
      await db.table(chunk.table as keyof DatabaseSchema).bulkPut(chunk.rows);
    }
  });
  return meta;
}

export { isNetworkError };
