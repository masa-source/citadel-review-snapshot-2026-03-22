import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db/db";
import {
  TABLE_KEYS,
  MASTER_KEYS,
  TRANSACTIONAL_KEYS,
  exportDatabase,
  clearTransactionalData,
} from "./dbExport";

describe("dbExport constants", () => {
  describe("TABLE_KEYS", () => {
    it("should contain all tables (メタデータ駆動: schemaDefinitions, sites)", () => {
      expect(TABLE_KEYS.length).toBeGreaterThanOrEqual(14);
    });

    it("should include master tables", () => {
      expect(TABLE_KEYS).toContain("companies");
      expect(TABLE_KEYS).toContain("workers");
      expect(TABLE_KEYS).toContain("instruments");
      expect(TABLE_KEYS).toContain("schemaDefinitions");
      expect(TABLE_KEYS).toContain("sites");
    });

    it("should include transaction tables", () => {
      expect(TABLE_KEYS).toContain("reports");
      expect(TABLE_KEYS).toContain("reportSites");
      expect(TABLE_KEYS).toContain("reportClients");
    });
  });

  describe("MASTER_KEYS", () => {
    it("should contain master data tables", () => {
      expect(MASTER_KEYS).toContain("companies");
      expect(MASTER_KEYS).toContain("workers");
      expect(MASTER_KEYS).toContain("instruments");
      expect(MASTER_KEYS).toContain("schemaDefinitions");
      expect(MASTER_KEYS).toContain("sites");
      expect(MASTER_KEYS).toContain("parts");
      expect(MASTER_KEYS).toContain("ownedInstruments");
    });

    it("should not contain transaction tables", () => {
      expect(MASTER_KEYS).not.toContain("reports");
    });
  });

  describe("TRANSACTIONAL_KEYS", () => {
    it("should contain transaction data tables", () => {
      expect(TRANSACTIONAL_KEYS).toContain("reports");
      expect(TRANSACTIONAL_KEYS).toContain("reportSites");
      expect(TRANSACTIONAL_KEYS).toContain("reportClients");
      expect(TRANSACTIONAL_KEYS).toContain("reportWorkers");
    });

    it("should not contain master tables", () => {
      expect(TRANSACTIONAL_KEYS).not.toContain("companies");
      expect(TRANSACTIONAL_KEYS).not.toContain("workers");
      expect(TRANSACTIONAL_KEYS).not.toContain("instruments");
    });
  });

  describe("MASTER_KEYS and TRANSACTIONAL_KEYS coverage", () => {
    it("should cover most TABLE_KEYS between MASTER and TRANSACTIONAL", () => {
      const combined = [...MASTER_KEYS, ...TRANSACTIONAL_KEYS];
      // Verifies the categorization is intentional
      for (const key of combined) {
        expect(TABLE_KEYS).toContain(key);
      }
    });
  });
});

describe("exportDatabase", () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
  });

  afterEach(async () => {
    // Clean up after each test
    await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
  });

  it("should export empty database", async () => {
    const data = await exportDatabase();

    for (const key of TABLE_KEYS) {
      expect(data[key]).toBeDefined();
      expect(data[key]).toEqual([]);
    }
  });

  it("should export database with companies", async () => {
    await db.companies.add({
      id: "company-uuid-1",
      name: "Test Company",
      department: "Engineering",
    });

    const data = await exportDatabase();

    expect(data.companies).toHaveLength(1);
    expect(data.companies[0].name).toBe("Test Company");
  });

  it("should export database with multiple tables", async () => {
    await db.companies.add({ id: "company-uuid-1", name: "Test Company" });
    await db.workers.add({
      id: "worker-uuid-1",
      name: "Test Worker",
      companyId: "company-uuid-1",
    });
    await db.instruments.add({
      id: "instrument-uuid-1",
      name: "Test Instrument",
      companyId: "company-uuid-1",
    });
    await db.reports.add({
      id: "report-uuid-1",
      companyId: "company-uuid-1",
    });

    const data = await exportDatabase();

    expect(data.companies).toHaveLength(1);
    expect(data.workers).toHaveLength(1);
    expect(data.instruments).toHaveLength(1);
    expect(data.reports).toHaveLength(1);
  });

  it("should preserve all fields", async () => {
    await db.companies.add({
      id: "company-uuid-1",
      name: "Full Company",
      department: "Sales",
      postalCode: "123-4567",
      address: "123 Test St",
      phone: "123-456-7890",
      fax: "123-456-7891",
      email: "test@example.com",
    });

    const data = await exportDatabase();

    const company = data.companies[0];
    expect(company.name).toBe("Full Company");
    expect(company.department).toBe("Sales");
    expect(company.postalCode).toBe("123-4567");
    expect(company.address).toBe("123 Test St");
    expect(company.phone).toBe("123-456-7890");
    expect(company.fax).toBe("123-456-7891");
    expect(company.email).toBe("test@example.com");
  });
});

describe("clearTransactionalData", () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
  });

  afterEach(async () => {
    // Clean up after each test
    await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
  });

  it("should clear transaction tables", async () => {
    // Add transaction data (reports テーブル)
    await db.reports.add({
      id: "report-uuid-1",
      companyId: "company-uuid-1",
    });

    // Verify data exists
    expect(await db.reports.count()).toBe(1);

    // Clear transactional data
    await clearTransactionalData();

    // Verify data is cleared
    expect(await db.reports.count()).toBe(0);
  });

  it("should preserve master data", async () => {
    // Add master data
    await db.companies.add({ id: "company-uuid-1", name: "Test Company" });
    await db.workers.add({
      id: "worker-uuid-1",
      name: "Test Worker",
      companyId: "company-uuid-1",
    });

    // Add transaction data
    await db.reports.add({
      id: "report-uuid-1",
      companyId: "company-uuid-1",
    });

    // Verify all data exists
    expect(await db.companies.count()).toBe(1);
    expect(await db.workers.count()).toBe(1);
    expect(await db.reports.count()).toBe(1);

    // Clear transactional data
    await clearTransactionalData();

    // Verify master data is preserved
    expect(await db.companies.count()).toBe(1);
    expect(await db.workers.count()).toBe(1);

    // Verify transaction data is cleared
    expect(await db.reports.count()).toBe(0);
  });

  it("should clear all transactional tables", async () => {
    // Add data to multiple transactional tables
    await db.reports.add({
      id: "report-uuid-1",
      companyId: "company-uuid-1",
    });
    await db.reportWorkers.add({
      id: "rw-uuid-1",
      reportId: "report-uuid-1",
      workerId: "worker-uuid-1",
      sortOrder: 0,
    });
    await db.targetInstruments.add({
      id: "ti-uuid-1",
      reportId: "report-uuid-1",
      instrumentId: "instrument-uuid-1",
      sortOrder: 0,
    });
    await db.usedParts.add({
      id: "up-uuid-1",
      reportId: "report-uuid-1",
      partId: "part-uuid-1",
      quantity: 1,
      sortOrder: 0,
    });

    // Clear transactional data
    await clearTransactionalData();

    // Verify all transactional tables are cleared
    for (const key of TRANSACTIONAL_KEYS) {
      const count = await db.table(key).count();
      expect(count).toBe(0);
    }
  });
});
