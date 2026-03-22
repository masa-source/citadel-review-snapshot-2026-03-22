/**
 * IndexedDB への db.json 形式データのインポートロジック（ID再採番・ID維持）。
 * テーブル順序・外部キーは @citadel/types の schemaRegistry（単一情報源）から取得。
 */

import type { DatabaseSchema, TableRow } from "@citadel/types";
import { db } from "@/db/db";
import { TABLE_KEYS, FOREIGN_KEYS, TABLE_LABELS, getImportOrder } from "@citadel/types";
import { generateUUID } from "@/utils/uuid";
import { MASTER_KEYS, TRANSACTIONAL_KEYS } from "@/utils/dbExport";

/** インポート時のテーブル処理順序（親→子の依存関係順）。FOREIGN_KEYS からトポロジカルソートで導出 */
export const IMPORT_ORDER: (keyof DatabaseSchema)[] = getImportOrder();

/**
 * すべての TABLE_KEYS が存在しそれぞれが配列であり、
 * 各配列要素がオブジェクトであることを要求する軽量な実行時チェック。
 */
export function isDatabaseSchema(obj: unknown): obj is DatabaseSchema {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  for (const key of TABLE_KEYS) {
    const val = o[key];
    if (!Array.isArray(val)) return false;
    for (const item of val) {
      if (typeof item !== "object" || item === null) return false;
    }
  }
  return true;
}

export interface ImportOptions {
  clearBeforeImport: boolean;
  onProgress?: (message: string) => void;
}

/** テーブル K の行を 1 件ずつ ID 再採番・FK 置換して Dexie に追加する。 */
async function processTable<K extends keyof DatabaseSchema>(
  tableKey: K,
  rows: DatabaseSchema[K],
  idMaps: Partial<Record<keyof DatabaseSchema, Map<string, string>>>,
  onProgress?: (message: string) => void,
  beforeAdd?: (item: Record<string, unknown>) => void
): Promise<void> {
  if (!rows || rows.length === 0) return;
  onProgress?.(`${TABLE_LABELS[tableKey]} をインポート中...`);
  const fkDef = FOREIGN_KEYS[tableKey] ?? {};

  for (const row of rows) {
    const rowTyped = row as TableRow<K>;
    const oldId =
      typeof (rowTyped as Record<string, unknown>).id === "string"
        ? (rowTyped as Record<string, unknown>).id
        : undefined;
    const item = { ...rowTyped } as TableRow<K> & Record<string, unknown>;
    (item as Record<string, unknown>).id = generateUUID();

    for (const [fkField, refTable] of Object.entries(fkDef) as [string, keyof DatabaseSchema][]) {
      const oldFkId = (item as Record<string, unknown>)[fkField];
      if (oldFkId != null && idMaps[refTable]) {
        const newFkId = idMaps[refTable].get(String(oldFkId));
        if (newFkId != null) {
          (item as Record<string, unknown>)[fkField] = newFkId;
        }
      }
    }

    beforeAdd?.(item as Record<string, unknown>);
    // Dexie の table(key) が union 型を返すため、add 引数は最小限のアサーションで通す
    const newId = await db.table(tableKey).add(item as never);
    if (oldId != null && idMaps[tableKey]) {
      idMaps[tableKey].set(String(oldId), String(newId));
    }
  }
}

/**
 * ID再採番付きインポート。親→子の順で処理し、外部キーを新しいIDに変換する。
 */
export async function importWithIdRemapping(
  data: DatabaseSchema,
  options: ImportOptions
): Promise<void> {
  const { clearBeforeImport, onProgress } = options;
  const idMaps: Partial<Record<keyof DatabaseSchema, Map<string, string>>> = {};
  for (const key of IMPORT_ORDER) {
    idMaps[key] = new Map();
  }

  await db.transaction("rw", TABLE_KEYS as unknown as string[], async () => {
    if (clearBeforeImport) {
      await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
    }

    for (const tableKey of IMPORT_ORDER) {
      const rows = data[tableKey];
      await processTable(tableKey, rows, idMaps, onProgress);
    }
  });
}

/**
 * 通常インポート（IDを維持）。bulkPut で上書き。
 */
export async function importWithOriginalIds(
  data: DatabaseSchema,
  options: ImportOptions
): Promise<void> {
  const { clearBeforeImport } = options;

  await db.transaction("rw", TABLE_KEYS as unknown as string[], async () => {
    if (clearBeforeImport) {
      await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
    }
    for (const key of TABLE_KEYS) {
      const rows = data[key];
      if (rows && rows.length > 0) {
        await db.table(key).bulkPut(rows as never);
      }
    }
  });
}

const TRANSACTIONAL_SET = new Set(TRANSACTIONAL_KEYS);

/**
 * ハイブリッドコピーインポート: マスターはID維持、トランザクションのみ新UUID。
 * Copy 権限の Direct Handoff 受信時に使用。
 */
export async function importWithHybridCopy(
  data: DatabaseSchema,
  options: ImportOptions
): Promise<void> {
  const { clearBeforeImport, onProgress } = options;
  const idMaps: Partial<Record<keyof DatabaseSchema, Map<string, string>>> = {};
  for (const key of TRANSACTIONAL_KEYS) {
    idMaps[key] = new Map();
  }

  await db.transaction("rw", TABLE_KEYS as unknown as string[], async () => {
    if (clearBeforeImport) {
      await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
    }

    for (const tableKey of IMPORT_ORDER) {
      const rows = data[tableKey];
      if (!rows || rows.length === 0) continue;

      if (MASTER_KEYS.includes(tableKey)) {
        await db.table(tableKey).bulkPut(rows as never);
        continue;
      }

      if (!TRANSACTIONAL_SET.has(tableKey)) continue;

      const beforeAdd =
        tableKey === "reports"
          ? (item: Record<string, unknown>) => {
              item.createdAt = new Date().toISOString();
              item.updatedAt = new Date().toISOString();
              delete item.reportSnapshot;
            }
          : undefined;

      await processTable(tableKey, rows, idMaps, onProgress, beforeAdd);
    }
  });
}
