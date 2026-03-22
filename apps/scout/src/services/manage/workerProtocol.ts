/**
 * 同期用 Web Worker のメッセージプロトコル型定義。
 * メイン → Worker: コマンド、Worker → メイン: イベント（進捗・完了・エラー）。
 */

import type { DatabaseSchema } from "@citadel/types";

/** メインスレッドから Worker へ送るコマンド */
export type WorkerCommand =
  | { type: "EXPORT_DATABASE" }
  | {
      type: "MERGE_INTO_DB";
      payload: { data: Partial<DatabaseSchema>; clearFirst: boolean };
    };

/** Worker からメインスレッドへ送るイベント */
export type WorkerEvent =
  | { type: "PROGRESS"; progress: number; message?: string }
  | { type: "DONE" }
  | { type: "EXPORT_RESULT"; data: DatabaseSchema }
  | { type: "ERROR"; message: string; code?: string };

/** 型ガード: Worker からのメッセージが WorkerEvent であるか */
export function isWorkerEvent(value: unknown): value is WorkerEvent {
  if (value == null || typeof value !== "object" || !("type" in value)) return false;
  const t = (value as WorkerEvent).type;
  return t === "PROGRESS" || t === "DONE" || t === "EXPORT_RESULT" || t === "ERROR";
}
