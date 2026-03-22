/**
 * sortOrder を持つ子テーブルの「並び替え（swap）」と「削除後の詰め」を共通化。
 * Dexie トランザクションはこのモジュール内で実行する。
 */

import type { Table } from "dexie";
import { db } from "@/db/db";

/** API 型（id/sortOrder が null 許容）と互換にするため null 許容 */
type SortOrderItem = { id?: string | null; sortOrder?: number | null };

/**
 * 親に紐づくリストの index と隣（上 or 下）の 2 件の sortOrder を入れ替える。
 * 呼び出し元で削除は行わない。getList は sortOrder でソート済みのリストを返す前提。
 */
export async function swapSortOrderByIndex(
  getList: (parentId: string) => Promise<SortOrderItem[]>,
  update: (id: string, payload: { sortOrder?: number }) => Promise<void>,
  dexieTable: Table<SortOrderItem, string>,
  parentId: string,
  index: number,
  direction: "up" | "down"
): Promise<void> {
  const list = await getList(parentId);
  const i = direction === "up" ? index - 1 : index;
  const j = direction === "up" ? index : index + 1;
  if (i < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  if (!a?.id || !b?.id) return;
  await db.transaction("rw", dexieTable, async () => {
    await update(a.id!, { sortOrder: b.sortOrder ?? j });
    await update(b.id!, { sortOrder: a.sortOrder ?? i });
  });
}

/**
 * 1 件削除済みの状態で、残りのリストの sortOrder を 0, 1, 2, ... に詰める。
 * 呼び出し元で delete 実行後に呼ぶこと。
 */
export async function reorderSortOrderAfterDelete(
  getList: (parentId: string) => Promise<SortOrderItem[]>,
  update: (id: string, payload: { sortOrder?: number }) => Promise<void>,
  dexieTable: Table<SortOrderItem, string>,
  parentId: string
): Promise<void> {
  const remaining = await getList(parentId);
  await db.transaction("rw", dexieTable, async () => {
    for (let i = 0; i < remaining.length; i++) {
      const id = remaining[i].id;
      if (id) await update(id, { sortOrder: i });
    }
  });
}
