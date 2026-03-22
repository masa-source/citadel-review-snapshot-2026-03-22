/**
 * IndexedDB の単体テスト（fake-indexeddb 使用）。
 * シナリオ: v1 の DB に未同期レポートを投入 → 同じ db で open し直してデータが保持されることを検証する。
 */
import { describe, it, expect, beforeEach } from "vitest";
import Dexie from "dexie";
import { db, DB_NAME } from "./db";

/** db.ts の version(1) と同じスキーマ（テスト用 Dexie で使用） */
const V1_SCHEMA = {
  companies: "id",
  workers: "id, companyId",
  instruments: "id, companyId",
  schemaDefinitions: "id",
  sites: "id, companyId",
  parts: "id, companyId",
  ownedInstruments: "id, companyId, instrumentId",
  reports: "id, companyId, schemaId, controlNumber",
  reportSites: "id, reportId, siteId, sortOrder",
  reportClients: "id, reportId, companyId, sortOrder",
  reportWorkers: "id, reportId, workerId, sortOrder",
  targetInstruments: "id, reportId, instrumentId, sortOrder",
  usedParts: "id, reportId, partId, sortOrder",
  reportOwnedInstruments: "id, reportId, ownedInstrumentId",
  missions: "missionId",
};

describe("DB (v1)", () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
  });

  it("投入した isLocal レポートが open し直しても保持される", async () => {
    // 1. v1 の Dexie で DB を作成し、未同期レポートを 1 件投入してクローズ
    const testDb = new Dexie(DB_NAME);
    testDb.version(1).stores(V1_SCHEMA);
    await testDb.open();
    await testDb.table("reports").add({
      id: "report-local-1",
      reportType: "inspection",
      companyId: "company-1",
      reportTitle: "未同期のレポート",
      controlNumber: "CTL-001",
      isLocal: true,
    });
    await testDb.close();

    // 2. 本番の db（v1）で open
    await db.open();

    // 3. 未同期レポートが保持されていることをアサート
    const reports = await db.reports.toArray();
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe("report-local-1");
    expect(reports[0].reportTitle).toBe("未同期のレポート");
    expect(reports[0].isLocal).toBe(true);
  });
});
