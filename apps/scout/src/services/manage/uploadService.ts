/**
 * データアップロードの通信ロジック。
 * 状態は持たず、結果を返す。useUpload が状態を管理する。
 * 405 を防ぐため /api/sync/upload には fetch で明示的に POST を送る。
 */

import { ErrorCodes, type DatabaseSchema, type MissionMeta, type ErrorCode } from "@citadel/types";
import { db } from "@/db/db";
import { getApiBaseUrl, getDefaultHeaders } from "@/utils/apiClient";
import { exportDatabase } from "@/utils/dbExport";

/** アップロード payload（DatabaseSchema + 任務メタの拡張） */
export type UploadPayload = DatabaseSchema & { _mission?: MissionMeta };

export type UploadResult =
  | { ok: true }
  | { ok: false; purged: true }
  | { ok: false; errorMessage: string };

/**
 * エクスポートデータ + 任務メタを組み立ててアップロード用 payload を返す。
 * メインスレッドで exportDatabase() を実行する。
 */
export async function buildUploadPayload(): Promise<UploadPayload> {
  const data = await exportDatabase();
  return buildUploadPayloadFromData(data);
}

/**
 * 既に取得した DatabaseSchema に任務メタを付与して UploadPayload を返す。
 * Worker でエクスポートした data を渡す場合に使用する。
 */
export async function buildUploadPayloadFromData(data: DatabaseSchema): Promise<UploadPayload> {
  const payload: UploadPayload = { ...data };
  const missions = (await (db.missions?.toArray?.() ?? Promise.resolve([]))) ?? [];
  const mission = missions[0];
  if (mission?.missionId) {
    payload._mission = {
      missionId: mission.missionId,
      permission: mission.permission ?? "View",
      issuedAt: mission.issuedAt,
      expiresAt: mission.expiresAt,
    };
  }
  return payload;
}

/** Begin レスポンス */
interface UploadBeginResponse {
  sessionId: string;
  expiresAt: string;
  expectedOrder: string[];
}

/** Status レスポンス */
interface UploadStatusResponse {
  sessionId: string;
  receivedSequenceIndices: number[];
  expectedOrder: string[];
  expiresAt: string;
}

/**
 * チャンク単位で送信し、失敗時は status で受信済みを確認してレジュームする。
 * 1. /sync/upload/begin でセッション開始
 * 2. expectedOrder の順で各テーブルを chunk として送信
 * 3. 送信失敗時は /sync/upload/sessions/{sessionId}/status で受信済みを取得し、未送信から再送
 * 4. 全送信後に /sync/upload/commit
 */
export async function uploadWithChunkSession(
  data: UploadPayload,
  maxRetries = 3,
  mode: "copy" | "overwrite" = "copy"
): Promise<UploadResult> {
  const baseUrl = getApiBaseUrl();
  const headers = getDefaultHeaders();

  // --- Begin ---
  let sessionId: string;
  let expectedOrder: string[];

  try {
    const beginRes = await fetch(`${baseUrl}/api/sync/upload/begin`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode,
        _mission: data._mission ?? undefined,
      }),
    });
    const beginText = await beginRes.text();
    if (beginRes.status === 403) {
      let errBody: unknown = null;
      try {
        errBody = JSON.parse(beginText);
      } catch {
        // ignore
      }
      if (
        errBody &&
        typeof errBody === "object" &&
        "code" in errBody &&
        (errBody as { code?: ErrorCode }).code === ErrorCodes.PURGED
      ) {
        return { ok: false, purged: true };
      }
    }
    if (!beginRes.ok) {
      return {
        ok: false,
        errorMessage: `Begin 失敗 (${beginRes.status}): ${beginText}`,
      };
    }
    const beginJson = JSON.parse(beginText) as UploadBeginResponse;
    sessionId = beginJson.sessionId;
    expectedOrder = beginJson.expectedOrder ?? [];
  } catch (e) {
    if (e instanceof TypeError && e.message.includes("fetch")) {
      return {
        ok: false,
        errorMessage: "サーバーに接続できませんでした。ネットワーク接続を確認してください。",
      };
    }
    throw e;
  }

  // --- Chunks: 送信済みでない index から順に送る。失敗時は status でレジューム ---
  const totalChunks = expectedOrder.length;
  let nextIndex = 0;

  const fetchStatus = async (): Promise<Set<number>> => {
    const res = await fetch(
      `${baseUrl}/api/sync/upload/sessions/${encodeURIComponent(sessionId)}/status`,
      { method: "GET", headers }
    );
    if (!res.ok) return new Set();
    const statusJson = (await res.json()) as UploadStatusResponse;
    return new Set(statusJson.receivedSequenceIndices ?? []);
  };

  while (nextIndex < totalChunks) {
    let sent = false;
    for (let r = 0; r < maxRetries && !sent; r++) {
      try {
        const table = expectedOrder[nextIndex];
        const payload = data as unknown as Record<string, unknown>;
        const rows = Array.isArray(payload[table]) ? (payload[table] as unknown[]) : [];
        const chunkRes = await fetch(`${baseUrl}/api/sync/upload/chunk`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            sessionId,
            sequenceIndex: nextIndex,
            table,
            rows,
          }),
        });
        const chunkText = await chunkRes.text();
        if (chunkRes.status === 410 || chunkRes.status === 404) {
          return {
            ok: false,
            errorMessage: "セッションの有効期限が切れました。最初からやり直してください。",
          };
        }
        if (chunkRes.ok) {
          sent = true;
          nextIndex++;
          break;
        }
        if (chunkRes.status >= 500 && r < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * Math.pow(2, r)));
          continue;
        }
        if (!chunkRes.ok) {
          return {
            ok: false,
            errorMessage: `チャンク送信失敗 (${chunkRes.status}): ${chunkText}`,
          };
        }
      } catch (e) {
        if (e instanceof TypeError && e.message.includes("fetch")) {
          if (r < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * Math.pow(2, r)));
            continue;
          }
          // ネットワーク失敗が続いた場合: status で受信済みを確認しレジューム
          const received = await fetchStatus();
          const firstMissing = expectedOrder.findIndex((_, i) => !received.has(i));
          nextIndex = firstMissing >= 0 ? firstMissing : totalChunks;
          break;
        }
        throw e;
      }
    }
    if (!sent) {
      // リトライし尽くしたが送信できなかった場合、status で進捗を確認
      const received = await fetchStatus();
      const firstMissing = expectedOrder.findIndex((_, i) => !received.has(i));
      if (firstMissing < 0) break;
      if (firstMissing >= nextIndex) {
        return {
          ok: false,
          errorMessage: `チャンク (${nextIndex}) の送信に失敗しました。`,
        };
      }
      nextIndex = firstMissing;
    }
  }

  // --- Commit ---
  try {
    const commitRes = await fetch(`${baseUrl}/api/sync/upload/commit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId }),
    });
    const commitText = await commitRes.text();
    if (commitRes.status === 410 || commitRes.status === 404) {
      return {
        ok: false,
        errorMessage: "セッションの有効期限が切れました。最初からやり直してください。",
      };
    }
    if (!commitRes.ok) {
      return {
        ok: false,
        errorMessage: `Commit 失敗 (${commitRes.status}): ${commitText}`,
      };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof TypeError && e.message.includes("fetch")) {
      return {
        ok: false,
        errorMessage: "サーバーに接続できませんでした。ネットワーク接続を確認してください。",
      };
    }
    throw e;
  }
}
