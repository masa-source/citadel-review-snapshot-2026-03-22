/**
 * dbImporter の単体テスト（fake-indexeddb 使用）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/db";
import { TABLE_KEYS } from "./dbExport";
import type { DatabaseSchema } from "@citadel/types";
import { FOREIGN_KEYS } from "@citadel/types";
import {
  isDatabaseSchema,
  importWithIdRemapping,
  importWithOriginalIds,
  importWithHybridCopy,
  IMPORT_ORDER,
} from "./dbImporter";

describe("dbImporter", () => {
  beforeEach(async () => {
    await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
  });

  /** すべての TABLE_KEYS が存在し配列である最小のオブジェクト（isDatabaseSchema 用） */
  const minimalSchema = (): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (const key of TABLE_KEYS) {
      o[key] = [];
    }
    return o;
  };

  describe("isDatabaseSchema", () => {
    it("すべての TABLE_KEYS が存在しそれぞれ配列かつ要素がオブジェクトなら true", () => {
      expect(isDatabaseSchema(minimalSchema())).toBe(true);
      const withItem = minimalSchema();
      withItem.companies = [{}];
      expect(isDatabaseSchema(withItem)).toBe(true);
    });
    it("TABLE_KEYS が欠けている・配列でない・要素が非オブジェクトなら false", () => {
      expect(isDatabaseSchema({})).toBe(false);
      expect(isDatabaseSchema({ companies: [], reports: [] })).toBe(false);
      expect(isDatabaseSchema({ foo: "bar" })).toBe(false);
      const badElement = minimalSchema();
      badElement.companies = [null];
      expect(isDatabaseSchema(badElement)).toBe(false);
      const badElement2 = minimalSchema();
      badElement2.companies = ["string"];
      expect(isDatabaseSchema(badElement2)).toBe(false);
      expect(isDatabaseSchema(null)).toBe(false);
      expect(isDatabaseSchema(undefined)).toBe(false);
    });
    it("必須キーが1つでも欠けていると false", () => {
      const partial = { ...minimalSchema() };
      delete (partial as Record<string, unknown>).companies;
      expect(isDatabaseSchema(partial)).toBe(false);
    });
    it("配列要素が空オブジェクト {} の場合は true（オブジェクトとして許容）", () => {
      const withEmptyObj = minimalSchema();
      (withEmptyObj as Record<string, unknown>).companies = [{}];
      expect(isDatabaseSchema(withEmptyObj)).toBe(true);
    });
  });

  describe("importWithIdRemapping", () => {
    it("親→子の順でインポートし外部キーを再採番する", async () => {
      const data: DatabaseSchema = {
        companies: [{ id: "c1", name: "Company A" }],
        workers: [],
        instruments: [],
        schemaDefinitions: [],
        sites: [],
        parts: [],
        ownedInstruments: [],
        reportFormats: [],
        reports: [
          {
            id: "r1",
            companyId: "c1",
            reportTitle: "Report 1",
          },
        ],
        reportSites: [],
        reportClients: [],
        reportWorkers: [],
        targetInstruments: [],
        tableDefinitions: [],
        targetInstrumentTables: [],
        usedParts: [],
        reportOwnedInstruments: [],
      };
      await importWithIdRemapping(data, { clearBeforeImport: true });
      const companies = await db.companies.toArray();
      const reports = await db.reports.toArray();
      expect(companies.length).toBe(1);
      expect(reports.length).toBe(1);
      expect(reports[0].companyId).toBe(companies[0].id);
      expect(reports[0].reportTitle).toBe("Report 1");
    });
    it("onProgress が呼ばれる", async () => {
      const messages: string[] = [];
      await importWithIdRemapping(
        {
          companies: [{ name: "C" }],
          reports: [],
        } as unknown as DatabaseSchema,
        { clearBeforeImport: true, onProgress: (m) => messages.push(m) }
      );
      expect(messages.some((m) => m.includes("Companies"))).toBe(true);
    });
    it("report.companyId が親 companies に存在しない場合でもクラッシュせず完了する（Dexie は外部キー制約なし）", async () => {
      const data: DatabaseSchema = {
        ...(minimalSchema() as unknown as DatabaseSchema),
        companies: [{ id: "c1", name: "Only One" }],
        reports: [
          {
            id: "r1",
            companyId: "non-existent-company-id",
            reportTitle: "Orphan Report",
          },
        ],
      };
      await expect(
        importWithIdRemapping(data, { clearBeforeImport: true })
      ).resolves.toBeUndefined();
      const reports = await db.reports.toArray();
      expect(reports).toHaveLength(1);
      expect(reports[0].companyId).toBe("non-existent-company-id");
    });
    it("全テーブルが空配列の完全スキーマでインポートしても例外が発生しない", async () => {
      const emptyFull = minimalSchema() as unknown as DatabaseSchema;
      await expect(
        importWithIdRemapping(emptyFull, { clearBeforeImport: true })
      ).resolves.toBeUndefined();
      await expect(
        importWithOriginalIds(emptyFull, { clearBeforeImport: true })
      ).resolves.toBeUndefined();
      await expect(
        importWithHybridCopy(emptyFull, { clearBeforeImport: true })
      ).resolves.toBeUndefined();
    });
    it("配列要素に id: null や id: 123 を含むデータでもクラッシュせずインポート完了する", async () => {
      const data = {
        ...minimalSchema(),
        companies: [
          { id: null, name: "No Id" },
          { id: 123, name: "Numeric Id" },
        ],
        reports: [],
      } as unknown as DatabaseSchema;
      await expect(
        importWithIdRemapping(data, { clearBeforeImport: true })
      ).resolves.toBeUndefined();
      const companies = await db.companies.toArray();
      expect(companies).toHaveLength(2);
    });
  });

  describe("importWithHybridCopy", () => {
    it("マスターはID維持・トランザクションのみ新UUIDになり、reports のメタデータがリセットされる", async () => {
      const masterId = "company-original-id";
      const reportId = "report-original-id";
      const data: DatabaseSchema = {
        companies: [{ id: masterId, name: "Company A" }],
        workers: [],
        instruments: [],
        schemaDefinitions: [],
        sites: [],
        parts: [],
        ownedInstruments: [],
        reportFormats: [],
        reports: [
          {
            id: reportId,
            companyId: masterId,
            reportTitle: "Report 1",
            createdAt: "2020-01-01T00:00:00Z",
            updatedAt: "2020-01-01T00:00:00Z",
            reportSnapshot: { completed: true },
          } as Record<string, unknown>,
        ],
        reportSites: [],
        reportClients: [],
        reportWorkers: [],
        targetInstruments: [],
        tableDefinitions: [],
        targetInstrumentTables: [],
        usedParts: [],
        reportOwnedInstruments: [],
      } as DatabaseSchema;
      await importWithHybridCopy(data, { clearBeforeImport: true });

      const companies = await db.companies.toArray();
      const reports = await db.reports.toArray();
      expect(companies).toHaveLength(1);
      expect(companies[0].id).toBe(masterId);
      expect(reports).toHaveLength(1);
      expect(reports[0].id).not.toBe(reportId);
      expect(reports[0].companyId).toBe(masterId);
      expect(reports[0].reportSnapshot).toBeUndefined();
      expect(reports[0].createdAt).toBeDefined();
      expect(reports[0].updatedAt).toBeDefined();
    });
  });

  describe("importWithOriginalIds", () => {
    it("IDを維持して bulkPut する", async () => {
      const id = "preserved-id-1";
      const data: DatabaseSchema = {
        companies: [{ id, name: "Preserved Company" }],
        workers: [],
        instruments: [],
        schemaDefinitions: [],
        sites: [],
        parts: [],
        ownedInstruments: [],
        reportFormats: [],
        reports: [],
        reportSites: [],
        reportClients: [],
        reportWorkers: [],
        targetInstruments: [],
        tableDefinitions: [],
        targetInstrumentTables: [],
        usedParts: [],
        reportOwnedInstruments: [],
      };
      await importWithOriginalIds(data, { clearBeforeImport: true });
      const company = await db.companies.get(id);
      expect(company?.name).toBe("Preserved Company");
    });
  });

  describe("IMPORT_ORDER / FOREIGN_KEYS", () => {
    it("IMPORT_ORDER に reports が companies より後にある", () => {
      const companiesIdx = IMPORT_ORDER.indexOf("companies");
      const reportsIdx = IMPORT_ORDER.indexOf("reports");
      expect(companiesIdx).toBeGreaterThanOrEqual(0);
      expect(reportsIdx).toBeGreaterThan(companiesIdx);
    });
    it("FOREIGN_KEYS.reports に companyId がある", () => {
      expect(FOREIGN_KEYS.reports?.companyId).toBe("companies");
    });
  });
});
