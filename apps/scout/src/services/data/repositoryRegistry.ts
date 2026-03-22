/**
 * リポジトリレジストリ（DRY）。
 *
 * 全テーブルのリポジトリインスタンスをここで一元管理する。
 * - getRepository(key)  : シングルトンインスタンスを遅延初期化して返す
 * - setRepository(key, instance) : テスト等でモックに差し替える（null でリセット）
 * - resetAllRepositories() : 全インスタンスをリセット（テストのクリーンアップ用）
 */

import type {
  Company,
  Instrument,
  OwnedInstrument,
  Part,
  Report,
  ReportClient,
  ReportFormat,
  ReportOwnedInstrument,
  ReportSite,
  ReportWorker,
  SchemaDefinition,
  Site,
  TableDefinition,
  TargetInstrument,
  TargetInstrumentTable,
  UsedPart,
  Worker,
} from "@citadel/types";
import { FOREIGN_KEYS } from "@citadel/types";
import type { Table } from "dexie";
import { db } from "@/db/db";
import {
  createDexieTableRepository,
  createDexieChildTableRepository,
  type TableRepository,
  type EntityWithId,
} from "./tableRepository";

// ────────────────────────────────────────────────────────────
// 子テーブル用の拡張型（reportId で一括操作するもの）
// ────────────────────────────────────────────────────────────

/** reportId を親キーとして持つ子テーブルの共通インターフェース */
export type ReportChildRepository<T extends EntityWithId> = TableRepository<T> & {
  getByReportId(reportId: string): Promise<T[]>;
  deleteByReportId(reportId: string): Promise<void>;
  swapSortOrder(reportId: string, index: number, direction: "up" | "down"): Promise<void>;
  reorderSortOrder(reportId: string): Promise<void>;
};

/** 子テーブルのベースとなる型（reportId と sortOrder を持つことを保証） */
type ReportChildEntity = EntityWithId & {
  reportId?: string | null;
  sortOrder?: number | null;
};

/** targetInstrumentTables 専用（親キーが 2 つある特殊ケース） */
export type TargetInstrumentTablesRepository = TableRepository<TargetInstrumentTable> & {
  getByTargetInstrumentId(targetInstrumentId: string): Promise<TargetInstrumentTable[]>;
  deleteByTargetInstrumentId(targetInstrumentId: string): Promise<void>;
  swapSortOrder(targetInstrumentId: string, index: number, direction: "up" | "down"): Promise<void>;
  reorderSortOrder(targetInstrumentId: string): Promise<void>;
  getByReportId(reportId: string): Promise<TargetInstrumentTable[]>;
  deleteByReportId(reportId: string): Promise<void>;
};

// ────────────────────────────────────────────────────────────
// テーブルキー → リポジトリ型の対応マップ
// ────────────────────────────────────────────────────────────

export type RepositoryMap = {
  // マスタテーブル（シンプルな TableRepository）
  companies: TableRepository<Company>;
  workers: TableRepository<Worker>;
  instruments: TableRepository<Instrument>;
  schemaDefinitions: TableRepository<SchemaDefinition>;
  sites: TableRepository<Site>;
  parts: TableRepository<Part>;
  ownedInstruments: TableRepository<OwnedInstrument>;
  tableDefinitions: TableRepository<TableDefinition>;
  reports: TableRepository<Report>;
  reportFormats: TableRepository<ReportFormat>;
  // 子テーブル（reportId を親キーとして持つ）
  reportSites: ReportChildRepository<ReportSite>;
  reportClients: ReportChildRepository<ReportClient>;
  reportWorkers: ReportChildRepository<ReportWorker>;
  targetInstruments: ReportChildRepository<TargetInstrument>;
  usedParts: ReportChildRepository<UsedPart>;
  reportOwnedInstruments: ReportChildRepository<ReportOwnedInstrument>;
  // 特殊：親キーが 2 つ
  targetInstrumentTables: TargetInstrumentTablesRepository;
};

// ────────────────────────────────────────────────────────────
// 内部シングルトンストア
// ────────────────────────────────────────────────────────────

type InstanceStore = {
  [K in keyof RepositoryMap]?: RepositoryMap[K] | null;
};

const instances: InstanceStore = {};

// ────────────────────────────────────────────────────────────
// ファクトリ関数（遅延初期化）
// ────────────────────────────────────────────────────────────

function createInstance<K extends keyof RepositoryMap>(key: K): RepositoryMap[K] {
  // ── 特殊：targetInstrumentTables（親キーが 2 つ）──
  if (key === "targetInstrumentTables") {
    const base = createDexieChildTableRepository<TargetInstrumentTable>(
      db.targetInstrumentTables,
      "targetInstrumentId",
      { sortBy: "sortOrder" }
    );
    return {
      ...base,
      getByTargetInstrumentId: base.getByParentId.bind(base),
      deleteByTargetInstrumentId: base.deleteByParentId.bind(base),
      swapSortOrder: base.swapSortOrder.bind(base),
      reorderSortOrder: base.reorderSortOrder.bind(base),
      async getByReportId(reportId: string) {
        return db.targetInstrumentTables.where("reportId").equals(reportId).sortBy("sortOrder");
      },
      async deleteByReportId(reportId: string) {
        await db.targetInstrumentTables.where("reportId").equals(reportId).delete();
      },
    } as unknown as RepositoryMap[K];
  }

  // ── 動的生成：FOREIGN_KEYS を用いた子テーブル / マスタテーブルの判定 ──
  const fks = FOREIGN_KEYS[key as keyof typeof FOREIGN_KEYS];
  const isReportChild = fks && "reportId" in fks;

  if (isReportChild) {
    // ── 子テーブル（reportId 親キー）──
    const dexieTable = (db as unknown as Record<string, Table<ReportChildEntity, string>>)[key];
    const base = createDexieChildTableRepository<ReportChildEntity>(dexieTable, "reportId", {
      sortBy: "sortOrder",
    });
    return {
      ...base,
      getByReportId: base.getByParentId.bind(base),
      deleteByReportId: base.deleteByParentId.bind(base),
      swapSortOrder: base.swapSortOrder.bind(base),
      reorderSortOrder: base.reorderSortOrder.bind(base),
    } as unknown as RepositoryMap[K];
  } else {
    // ── マスタテーブル ──
    const dexieTable = (db as unknown as Record<string, Table<EntityWithId, string>>)[key];
    return createDexieTableRepository<EntityWithId>(dexieTable) as unknown as RepositoryMap[K];
  }
}

// ────────────────────────────────────────────────────────────
// 公開 API
// ────────────────────────────────────────────────────────────

/**
 * 指定テーブルキーのリポジトリインスタンスを返す（シングルトン・遅延初期化）。
 *
 * @example
 *   const companyRepo = getRepository("companies");
 *   const reportWorkerRepo = getRepository("reportWorkers");
 */
export function getRepository<K extends keyof RepositoryMap>(key: K): RepositoryMap[K] {
  if (instances[key] == null) {
    instances[key] = createInstance(key);
  }
  return instances[key] as RepositoryMap[K];
}

/**
 * 指定テーブルキーのリポジトリをモックに差し替える（テスト用 DI）。
 * null を渡すとインスタンスキャッシュをクリアし、次回 getRepository 時に再生成される。
 *
 * @example
 *   setRepository("companies", mockCompanyRepo);
 *   setRepository("companies", null); // リセット
 */
export function setRepository<K extends keyof RepositoryMap>(
  key: K,
  instance: RepositoryMap[K] | null
): void {
  instances[key] = instance;
}

/**
 * 全リポジトリインスタンスをリセットする（テストのクリーンアップ等）。
 */
export function resetAllRepositories(): void {
  (Object.keys(instances) as (keyof RepositoryMap)[]).forEach((key) => {
    instances[key] = undefined;
  });
}
