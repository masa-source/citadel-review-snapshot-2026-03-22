/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 報告書ドメインのサービス層。
 * 保存・ロールバック・依頼先/担当者の並び替え・削除・追加を Repository 経由で集約する。
 */

import type { Report, ReportClient, ReportSite, ReportWorker } from "@citadel/types";
import type { Table } from "dexie";
import { db } from "@/db/db";
import {
  getRepository,
  swapSortOrderByIndex,
  reorderSortOrderAfterDelete,
  type RepositoryMap,
  type ReportChildRepository,
} from "@/services/data";
import { apiClient } from "@/utils/apiClient";

import { generateUUID } from "@/utils/uuid";

export type SaveReportParams = {
  /** 報告書の更新フィールド（id 除く）。updatedAt は必須。 */
  payload: Partial<Report> & { updatedAt: string };
  /** 現場（siteId + roleKey）。clientRows と同様に一度削除して再登録する。 */
  siteRows: { siteId: string; roleKey: string }[];
  /** 取引先（companyId + roleKey）。フォームの clientRows をそのまま渡す。 */
  clientRows: { companyId: string; roleKey: string }[];
  workerRows: { workerId: string; workerRole: string; roleKey: string }[];
  /** "new" のとき新規作成、それ以外は更新 */
  effectiveId: string;
};

export type SaveReportResult = {
  /** 新規作成時のみ。ナビゲーション用 */
  newId?: string;
};

const reportRepo = () => getRepository("reports");
const siteRepo = () => getRepository("reportSites");
const clientRepo = () => getRepository("reportClients");
const workerRepo = () => getRepository("reportWorkers");

/**
 * 報告書を新規作成または更新する。依頼先・担当者は一度削除してから再登録する。
 * 全テーブルへの書き込みを 1 トランザクションで行い、途中失敗時はロールバックして不整合を防ぐ。
 */
export async function saveReport(params: SaveReportParams): Promise<SaveReportResult> {
  const { payload, siteRows, clientRows, workerRows, effectiveId } = params;
  const reports = reportRepo();
  const sites = siteRepo();
  const clients = clientRepo();
  const workers = workerRepo();

  return db.transaction(
    "rw",
    [db.reports, db.reportSites, db.reportClients, db.reportWorkers],
    async (): Promise<SaveReportResult> => {
      if (effectiveId === "new") {
        const newId = generateUUID();
        await reports.add({
          ...payload,
          id: newId,
          isLocal: true,
        });
        await Promise.all(
          siteRows
            .filter((r) => r.siteId)
            .map((r, index) =>
              sites.add({
                id: generateUUID(),
                reportId: newId,
                siteId: r.siteId,
                roleKey: r.roleKey || undefined,
                sortOrder: index,
              } as ReportSite)
            )
        );
        await Promise.all(
          clientRows
            .filter((r) => r.companyId)
            .map((r, index) =>
              clients.add({
                id: generateUUID(),
                reportId: newId,
                companyId: r.companyId,
                roleKey: r.roleKey || undefined,
                sortOrder: index,
              } as ReportClient)
            )
        );
        for (let index = 0; index < workerRows.length; index++) {
          const row = workerRows[index];
          if (row.workerId) {
            await workers.add({
              id: generateUUID(),
              reportId: newId,
              workerId: row.workerId,
              workerRole: row.workerRole || undefined,
              roleKey: row.roleKey || undefined,
              sortOrder: index,
            } as ReportWorker);
          }
        }
        return { newId };
      }

      await reports.update(effectiveId, payload);
      await sites.deleteByReportId(effectiveId);
      await Promise.all(
        siteRows
          .filter((r) => r.siteId)
          .map((r, index) =>
            sites.add({
              id: generateUUID(),
              reportId: effectiveId,
              siteId: r.siteId,
              roleKey: r.roleKey || undefined,
              sortOrder: index,
            } as ReportSite)
          )
      );
      await clients.deleteByReportId(effectiveId);
      await Promise.all(
        clientRows
          .filter((r) => r.companyId)
          .map((r, index) =>
            clients.add({
              id: generateUUID(),
              reportId: effectiveId,
              companyId: r.companyId,
              roleKey: r.roleKey || undefined,
              sortOrder: index,
            } as ReportClient)
          )
      );
      await workers.deleteByReportId(effectiveId);
      for (let index = 0; index < workerRows.length; index++) {
        const row = workerRows[index];
        if (row.workerId) {
          await workers.add({
            id: generateUUID(),
            reportId: effectiveId,
            workerId: row.workerId,
            workerRole: row.workerRole || undefined,
            roleKey: row.roleKey || undefined,
            sortOrder: index,
          } as ReportWorker);
        }
      }
      return {};
    }
  );
}

/**
 * 指定した子テーブルエンティティの共通操作（並び替え・削除・追加・ロールキー更新）を提供するサービスを生成する。
 */
function createReportChildService<
  T extends {
    id?: string | null;
    reportId?: string | null;
    sortOrder?: number | null;
    roleKey?: string | null;
  },
  FK extends keyof T,
>(repoKey: keyof RepositoryMap, dbTable: Table<T, string>, foreignKey: FK, defaultRoleKey: string) {
  const getRepo = () => getRepository(repoKey) as unknown as ReportChildRepository<T>;

  return {
    swap: async (reportId: string, index: number, direction: "up" | "down"): Promise<void> => {
      const repo = getRepo();
      await swapSortOrderByIndex(
        repo.getByReportId.bind(repo),
        (id, payload) => repo.update(id, payload as Partial<T>),
        dbTable as any,
        reportId,
        index,
        direction
      );
    },

    deleteItem: async (reportId: string, id: string): Promise<void> => {
      const repo = getRepo();
      await repo.delete(id);
      await reorderSortOrderAfterDelete(
        repo.getByReportId.bind(repo),
        (id, payload) => repo.update(id, payload as Partial<T>),
        dbTable as any,
        reportId
      );
    },

    add: async (
      reportId: string,
      foreignId: string,
      roleKey: string = defaultRoleKey
    ): Promise<void> => {
      const repo = getRepo();
      const list = await repo.getByReportId(reportId);
      const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((r) => r.sortOrder ?? 0));
      await repo.add({
        id: generateUUID(),
        reportId,
        [foreignKey]: foreignId,
        roleKey: roleKey || undefined,
        sortOrder: maxOrder + 1,
      } as unknown as T);
    },

    updateRoleKey: async (id: string, newRoleKey: string): Promise<void> => {
      const repo = getRepo();
      await repo.update(id, { roleKey: newRoleKey } as Partial<T>);
    },
  };
}

// ── 作業者 (Worker) ────────────────────────────────────────────────────────
const workerService = createReportChildService<ReportWorker, "workerId">(
  "reportWorkers",
  db.reportWorkers,
  "workerId",
  "main"
);
export const swapReportWorker = workerService.swap;

// ── 現場 (Site) ────────────────────────────────────────────────────────────
const siteService = createReportChildService<ReportSite, "siteId">(
  "reportSites",
  db.reportSites,
  "siteId",
  "main"
);
export const swapReportSite = siteService.swap;
export const deleteReportSite = siteService.deleteItem;
export const addReportSite = siteService.add;
export const updateReportSiteRoleKey = siteService.updateRoleKey;

// ── 取引先 (Client) ─────────────────────────────────────────────────────────
const clientService = createReportChildService<ReportClient, "companyId">(
  "reportClients",
  db.reportClients,
  "companyId",
  "owner"
);
export const swapReportClient = clientService.swap;
export const deleteReportClient = clientService.deleteItem;
export const addReportClient = clientService.add;
export const updateReportClientRoleKey = clientService.updateRoleKey;

/**
 * 報告書とその関連データをすべて削除する（cascade）。
 */
export async function deleteReport(reportId: string): Promise<void> {
  const targetsRepo = getRepository("targetInstruments");
  const targetTablesRepo = getRepository("targetInstrumentTables");
  const usedPartsRepo = getRepository("usedParts");
  const ownedInstrumentsRepo = getRepository("reportOwnedInstruments");

  await db.transaction(
    "rw",
    [
      db.targetInstrumentTables,
      db.targetInstruments,
      db.reportWorkers,
      db.reportOwnedInstruments,
      db.usedParts,
      db.reportClients,
      db.reportSites,
      db.reports,
    ],
    async () => {
      await targetTablesRepo.deleteByReportId(reportId);
      await targetsRepo.deleteByReportId(reportId);

      await workerRepo().deleteByReportId(reportId);
      await ownedInstrumentsRepo.deleteByReportId(reportId);
      await usedPartsRepo.deleteByReportId(reportId);
      await clientRepo().deleteByReportId(reportId);
      await siteRepo().deleteByReportId(reportId);
      await reportRepo().delete(reportId);
    }
  );
}

/**
 * レポートを「完了」にしてスナップショットを保存する。
 * 成功すると void を返し、失敗すると Error を投げる。
 * API 通信のためオンライン時のみ呼び出すこと。
 */
export async function completeReport(reportId: string): Promise<void> {
  const res = await apiClient.POST("/api/reports/{report_id}/complete", {
    params: { path: { report_id: reportId } },
  });
  if (res.error) {
    const detail =
      res.error && typeof res.error === "object" && "detail" in res.error
        ? String((res.error as { detail?: unknown }).detail)
        : undefined;
    throw new Error(detail ?? "完了に失敗しました");
  }
}
