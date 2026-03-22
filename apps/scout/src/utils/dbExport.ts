import { db } from "@/db/db";
import type { DatabaseSchema } from "@citadel/types";
import { TABLE_KEYS } from "@citadel/types";

export { TABLE_KEYS };

/** マスタデータのテーブルキー（同期後も保持） */
export const MASTER_KEYS: (keyof DatabaseSchema)[] = [
  "companies",
  "workers",
  "instruments",
  "schemaDefinitions",
  "sites",
  "parts",
  "ownedInstruments",
  "tableDefinitions",
  "reportFormats",
];

/** トランザクションデータのテーブルキー（同期後に削除可能） */
export const TRANSACTIONAL_KEYS: (keyof DatabaseSchema)[] = [
  "reports",
  "reportSites",
  "reportClients",
  "reportWorkers",
  "targetInstruments",
  "targetInstrumentTables",
  "usedParts",
  "reportOwnedInstruments",
];

/** sort_order でソートし、配列インデックスを sortOrder として付与するテーブル */
const SORT_ORDER_TABLES: (keyof DatabaseSchema)[] = [
  "reportSites",
  "reportClients",
  "reportWorkers",
  "targetInstruments",
  "targetInstrumentTables",
  "reportOwnedInstruments",
  "usedParts",
];

/**
 * 現在の Dexie DB の全データを DatabaseSchema 形式で取得する。
 * エクスポート・API送信用に再利用する。
 * 配列系テーブルは sortOrder 昇順にソートし、インデックスを sortOrder として付与する。
 */
export async function exportDatabase(): Promise<DatabaseSchema> {
  const data = {} as DatabaseSchema;
  for (const key of TABLE_KEYS) {
    let rows = await db.table(key).toArray();
    if (SORT_ORDER_TABLES.includes(key)) {
      const withSort = rows as { sortOrder?: number }[];
      withSort.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      rows = withSort.map((row, index) => ({ ...row, sortOrder: index }));
    }
    (data as Record<keyof DatabaseSchema, unknown>)[key] = rows;
  }
  return data;
}

/**
 * トランザクションデータ（レポート関連）を全て削除する。
 * マスタデータ（会社、作業者、計器等）は保持される。
 * サーバー同期後のクリーンアップ用。
 */
export async function clearTransactionalData(): Promise<void> {
  await db.transaction("rw", TRANSACTIONAL_KEYS, async () => {
    await Promise.all(TRANSACTIONAL_KEYS.map((key) => db.table(key).clear()));
  });
}
