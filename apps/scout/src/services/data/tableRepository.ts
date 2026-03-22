/**
 * 単一テーブル向けの汎用リポジトリ（DRY）。
 * 各マスタは createDexieTableRepository(db.xxx) で同じ型の実装を共有する。
 */

import type { Table } from "dexie";
import { swapSortOrderByIndex, reorderSortOrderAfterDelete } from "./sortOrderChildHelpers";

/** id 付きエンティティの最小制約（Company 等の既存型をそのまま使うため index signature は要求しない）。API 型は id が null 許容のため null を許容する。 */
export type EntityWithId = { id?: string | null };

/** 単一テーブル CRUD。全マスタで共通のインターフェース */
export interface TableRepository<T extends EntityWithId> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  add(entity: T): Promise<string>;
  update(id: string, payload: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Dexie の Table を TableRepository にラップ（update の戻り値 number は void に吸収） */
export function createDexieTableRepository<T extends EntityWithId>(
  table: Table<T, string>
): TableRepository<T> {
  return {
    async list() {
      if (!table) return [] as T[];
      return table.toArray();
    },
    async get(id) {
      return table.get(id);
    },
    async add(entity) {
      return table.add(entity);
    },
    async update(id, payload) {
      await table.update(id, payload as Parameters<Table<T, string>["update"]>[1]);
    },
    async delete(id) {
      return table.delete(id);
    },
  };
}

/** 親キー付き子テーブル用の共通リポジトリ型 */
export type ChildTableRepository<T extends EntityWithId> = TableRepository<T> & {
  getByParentId(parentId: string): Promise<T[]>;
  deleteByParentId(parentId: string): Promise<void>;
  swapSortOrder(parentId: string, index: number, direction: "up" | "down"): Promise<void>;
  reorderSortOrder(parentId: string): Promise<void>;
};

/** 親IDで一覧取得・一括削除する子テーブル用ファクトリ。sortBy 指定で取得結果をソート。 */
export function createDexieChildTableRepository<T extends EntityWithId>(
  table: Table<T, string>,
  parentKey: keyof T & string,
  options?: { sortBy?: keyof T }
): ChildTableRepository<T> {
  const base = createDexieTableRepository<T>(table);
  return {
    ...base,
    async getByParentId(parentId: string) {
      const list = await table
        .where(parentKey as string)
        .equals(parentId)
        .toArray();
      if (options?.sortBy != null) {
        const key = options.sortBy as keyof T;
        list.sort((a, b) => ((a[key] as number) ?? 0) - ((b[key] as number) ?? 0));
      }
      return list;
    },
    async deleteByParentId(parentId: string) {
      await table
        .where(parentKey as string)
        .equals(parentId)
        .delete();
    },
    async swapSortOrder(parentId: string, index: number, direction: "up" | "down") {
      await swapSortOrderByIndex(
        (id: string) =>
          this.getByParentId(id) as Promise<{ id?: string | null; sortOrder?: number | null }[]>,
        (id: string, payload: { sortOrder?: number }) => this.update(id, payload as Partial<T>),
        table as unknown as Table<{ id?: string | null; sortOrder?: number | null }, string>,
        parentId,
        index,
        direction
      );
    },
    async reorderSortOrder(parentId: string) {
      await reorderSortOrderAfterDelete(
        (id: string) =>
          this.getByParentId(id) as Promise<{ id?: string | null; sortOrder?: number | null }[]>,
        (id: string, payload: { sortOrder?: number }) => this.update(id, payload as Partial<T>),
        table as unknown as Table<{ id?: string | null; sortOrder?: number | null }, string>,
        parentId
      );
    },
  };
}
