/**
 * Direct Handoff の通信・インポート処理（関心の分離）。
 * UI はこのサービスを呼ぶだけにし、状態はフックで管理する。
 */

import type { DatabaseSchema, MissionMeta } from "@citadel/types";
import { TABLE_KEYS } from "@citadel/types";
import { isNetworkError } from "@citadel/monitoring";
import { db, isSchemaError } from "@/db/db";
import { apiClient } from "@/utils/apiClient";
import { isDatabaseSchema, importWithHybridCopy, importWithOriginalIds } from "@/utils/dbImporter";

const STAGE_TIMEOUT_MS = 30_000;

export type HandoffResult =
  | { ok: true; total: number; message: string }
  | { ok: false; errorMessage: string; requestReset?: boolean };

export interface HandoffOptions {
  onProgress?: (message: string) => void;
}

/**
 * ステージング API からデータ取得 → 任務保存 → インポートまでを実行。
 * 状態更新は行わず結果を返す。UI は useHandoff でこの結果に応じて setState する。
 * インポート方式は _mission.permission で決定（Copy のときはハイブリッド、それ以外は ID 維持）。
 */
export async function runHandoff(
  ticketId: string,
  shouldClear: boolean,
  options: HandoffOptions = {}
): Promise<HandoffResult> {
  const { onProgress } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STAGE_TIMEOUT_MS);

  let res;
  try {
    res = await apiClient.GET("/api/sync/stage/{ticket_id}", {
      params: { path: { ticket_id: ticketId } },
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    throw fetchError;
  }

  if (!res.response.ok) {
    if (res.response.status === 404) {
      return {
        ok: false,
        errorMessage:
          "データが見つかりませんでした。有効期限が切れたか、既に取得済みの可能性があります。",
      };
    }
    return {
      ok: false,
      errorMessage: `サーバーエラー (${res.response.status})`,
    };
  }

  const data: unknown = res.data;
  if (data == null) {
    return { ok: false, errorMessage: "JSONのパースに失敗しました" };
  }

  if (!isDatabaseSchema(data)) {
    return { ok: false, errorMessage: "受信したデータの形式が不正です。" };
  }

  const typedData = data as DatabaseSchema & { _mission?: MissionMeta };
  const missionMeta = typedData._mission;

  if (missionMeta?.missionId) {
    const missionRow = {
      missionId: missionMeta.missionId,
      permission: missionMeta.permission ?? "Collect",
      issuedAt: missionMeta.issuedAt ?? new Date().toISOString(),
      expiresAt: missionMeta.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    if (db.missions) {
      await db.missions.clear();
      await db.missions.put(missionRow);
    }
  }

  onProgress?.("データをインポート中...");

  const permission = missionMeta?.permission ?? "Collect";
  if (permission === "Copy") {
    await importWithHybridCopy(typedData, {
      clearBeforeImport: shouldClear,
      onProgress: onProgress ?? undefined,
    });
  } else {
    await importWithOriginalIds(typedData, {
      clearBeforeImport: shouldClear,
    });
  }

  const total = TABLE_KEYS.reduce((s, k) => s + (typedData[k]?.length ?? 0), 0);
  const modeLabel = permission === "Copy" ? "（コピー: マスターID維持・報告書のみ新規）" : "";
  return {
    ok: true,
    total,
    message: `Adminからのデータ転送が完了しました。${total} 件のレコードをインポートしました。${modeLabel}`,
  };
}

/**
 * Handoff 実行時のエラーをユーザー向けメッセージに変換。
 * requestReset が true のときは呼び出し元で resetDatabaseWithConfirm を実行すること。
 */
export function normalizeHandoffError(error: unknown): {
  errorMessage: string;
  requestReset?: boolean;
} {
  if (!(error instanceof Error)) {
    return { errorMessage: "Direct Handoffに失敗しました。" };
  }
  const errorName = error.name || "";
  const errorMsg = error.message || "";

  if (isNetworkError(error)) {
    return {
      errorMessage:
        "バックエンドへの接続に失敗しました。他PCやIPアドレスでScoutを開いている場合は、バックエンドの ALLOWED_ORIGINS に Scout のオリジン（例: http://サーバのIP:3000）を追加し、バックエンドを再起動してください。詳細は docs/HANDOFF_TROUBLESHOOTING.md を参照してください。",
    };
  }

  if (isSchemaError(error)) {
    return {
      errorMessage: "データベースの形式が古いため、リセットが必要です。",
      requestReset: true,
    };
  }

  if (errorName === "DexieError" || errorName.includes("Dexie")) {
    return {
      errorMessage: `IndexedDBエラー: ${errorName} - ${errorMsg}`,
    };
  }

  return { errorMessage: error.message || "Direct Handoffに失敗しました。" };
}
