import { useLiveQuery } from "dexie-react-hooks";
import type { DatabaseSchema } from "@citadel/types";
import { TABLE_KEYS } from "@citadel/types";
import { db, isSchemaError } from "@/db/db";

const DB_ERROR_MESSAGE =
  "データベースの形式が古いため、リセットが必要です。未同期のレポートがある場合は先にエクスポートを推奨します。";

export interface UseManageCountsOptions {
  /** スキーマエラー時に呼ぶ（未指定時は呼ばない） */
  onDbError?: (message: string) => void;
}

/**
 * manage ページ用: 各テーブルの件数を useLiveQuery で取得。
 * スキーマエラー時は onDbError を呼ぶ。
 */
export function useManageCounts(
  options: UseManageCountsOptions = {}
): Record<keyof DatabaseSchema, number> | undefined {
  const { onDbError } = options;

  const counts = useLiveQuery(async () => {
    try {
      const entries = await Promise.all(
        TABLE_KEYS.map(async (key) => {
          const count = await db.table(key).count();
          return [key, count] as const;
        })
      );
      return Object.fromEntries(entries) as Record<keyof DatabaseSchema, number>;
    } catch (error) {
      console.error("[DB] カウント取得エラー:", error);
      if (isSchemaError(error) && onDbError) {
        onDbError(DB_ERROR_MESSAGE);
      }
      return undefined;
    }
  }, []);

  return counts;
}
