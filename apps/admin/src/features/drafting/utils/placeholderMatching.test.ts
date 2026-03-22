import { describe, it, expect } from "vitest";
import {
  flattenContextToPaths,
  buildValueToPathMap,
  isExcludedCellValue,
  choosePath,
  isOrderedPath,
  HIDDEN_KEYS,
  isHiddenKey,
  buildPlaceholderList,
  getCategoryForPath,
  getPathHint,
} from "./placeholderMatching";

describe("placeholderMatching", () => {
  describe("flattenContextToPaths", () => {
    it("emits Ordered paths with bracket notation [1],[2] when context has Ordered list", () => {
      const context = {
        reportWorkersByRole: {
          監督: { worker: { name: "Alice" } },
          作業者: { worker: { name: "Bob" } },
        },
        reportWorkersOrdered: [null, { worker: { name: "Alice" } }, { worker: { name: "Bob" } }],
      };
      const flat = flattenContextToPaths(context, "");
      expect(flat.some(({ path }) => path.includes("reportWorkersByRole.監督"))).toBe(true);
      expect(flat.some(({ path }) => path.includes("reportWorkersOrdered[1]"))).toBe(true);
      expect(flat.some(({ path }) => path.includes("reportWorkersOrdered[2]"))).toBe(true);
    });

    it("does not emit paths for hidden keys (id, createdAt, *Id)", () => {
      const context = {
        id: "11111111-1111-1111-1111-111111111111",
        companyId: "22222222-2222-2222-2222-222222222222",
        createdAt: "2024-01-01",
        name: "Test Company",
      };
      const flat = flattenContextToPaths(context, "");
      const paths = flat.map(({ path }) => path);
      expect(paths).toContain("name");
      expect(paths).not.toContain("id");
      expect(paths).not.toContain("companyId");
      expect(paths).not.toContain("createdAt");
    });

    it("expands primitive arrays as listName[0], listName[1]", () => {
      const context = { myList: ["a", "b", "c"] };
      const flat = flattenContextToPaths(context, "");
      expect(flat).toContainEqual({ path: "myList[0]", value: "a" });
      expect(flat).toContainEqual({ path: "myList[1]", value: "b" });
      expect(flat).toContainEqual({ path: "myList[2]", value: "c" });
    });

    it("does not expand object arrays (only Ordered/primitive arrays)", () => {
      const context = { items: [{ label: "A" }, { label: "B" }] };
      const flat = flattenContextToPaths(context, "");
      expect(flat.some(({ path }) => path === "items[0].label")).toBe(false);
      expect(flat.some(({ path }) => path === "items[1].label")).toBe(false);
    });

    it("expands key 'rows' when array of objects (0-based rows[0], rows[1])", () => {
      const context = {
        targetInstrumentPrimary: {
          tablesOrdered: [null, { rows: [{ point: "P1" }, { point: "P2" }] }],
        },
      };
      const flat = flattenContextToPaths(context, "");
      expect(
        flat.some(({ path, value }) => path.endsWith(".rows[0].point") && value === "P1")
      ).toBe(true);
      expect(
        flat.some(({ path, value }) => path.endsWith(".rows[1].point") && value === "P2")
      ).toBe(true);
    });

    it("does not expand non-ORDERED_LIST_KEYS arrays (e.g. usedPartsByCategory.seal)", () => {
      const context = {
        usedPartsByCategory: {
          seal: [{ part: { name: "Gasket A" } }, { part: { name: "Gasket B" } }],
        },
      };
      const flat = flattenContextToPaths(context, "");
      expect(flat.some(({ path }) => path === "usedPartsByCategory.seal[0].part.name")).toBe(false);
      expect(flat.some(({ path }) => path === "usedPartsByCategory.seal[1].part.name")).toBe(false);
    });
  });

  describe("buildValueToPathMap", () => {
    it("prefers Ordered[n] over raw [0] when both exist for same value", () => {
      const flat = [
        { path: "reportWorkers[0].worker.name", value: "Alice" },
        { path: "reportWorkersOrdered[1].worker.name", value: "Alice" },
        { path: "reportWorkersByRole.監督.worker.name", value: "Alice" },
      ];
      const map = buildValueToPathMap(flat);
      expect(map.get("Alice")).toBe("reportWorkersOrdered[1].worker.name");
    });

    it("does not add value to map when all paths are raw bracket (no Ordered)", () => {
      const flat = [{ path: "reportWorkers[0].worker.name", value: "OnlyIndex" }];
      const map = buildValueToPathMap(flat);
      expect(map.has("OnlyIndex")).toBe(false);
    });
  });

  describe("isExcludedCellValue", () => {
    it("returns true for UUID format string", () => {
      expect(isExcludedCellValue("11111111-1111-1111-1111-111111111111")).toBe(true);
      expect(isExcludedCellValue("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(true);
      expect(isExcludedCellValue("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(true);
    });

    it("returns false for non-UUID strings", () => {
      expect(isExcludedCellValue("Alice")).toBe(false);
      expect(isExcludedCellValue("TAG-001")).toBe(false);
    });
  });

  describe("choosePath", () => {
    it("prefers ordered path over plain key path", () => {
      const a = "reportWorkersOrdered[1].worker.name";
      const b = "reportWorkersByRole.監督.worker.name";
      expect(choosePath(a, b)).toBe(a);
    });
  });

  describe("isOrderedPath", () => {
    it("returns true for Ordered[n] bracket notation", () => {
      expect(isOrderedPath("reportWorkersOrdered[1]")).toBe(true);
      expect(isOrderedPath("targetInstrumentsOrdered[2]")).toBe(true);
    });
    it("returns false for dot notation or raw index", () => {
      expect(isOrderedPath("reportWorkersOrdered.1")).toBe(false);
      expect(isOrderedPath("reportWorkers[0]")).toBe(false);
    });
  });

  describe("shared constants", () => {
    it("HIDDEN_KEYS contains expected system metadata keys", () => {
      expect(HIDDEN_KEYS.has("id")).toBe(true);
      expect(HIDDEN_KEYS.has("createdAt")).toBe(true);
      expect(HIDDEN_KEYS.has("updatedAt")).toBe(true);
      expect(HIDDEN_KEYS.has("sortOrder")).toBe(true);
    });

    it("isHiddenKey returns true for id, *Id, and HIDDEN_KEYS", () => {
      expect(isHiddenKey("id")).toBe(true);
      expect(isHiddenKey("companyId")).toBe(true);
      expect(isHiddenKey("createdAt")).toBe(true);
      expect(isHiddenKey("name")).toBe(false);
    });
  });

  describe("getCategoryForPath", () => {
    it("returns 基本情報 for reportTitle, company.*, controlNumber, createdAt, reportType", () => {
      expect(getCategoryForPath("reportTitle")).toBe("基本情報");
      expect(getCategoryForPath("company.name")).toBe("基本情報");
      expect(getCategoryForPath("controlNumber")).toBe("基本情報");
      expect(getCategoryForPath("createdAt")).toBe("基本情報");
      expect(getCategoryForPath("reportType")).toBe("基本情報");
    });
    it("returns 作業者 for reportWorker* / reportWorkers*", () => {
      expect(getCategoryForPath("reportWorkerPrimary.worker.name")).toBe("作業者");
      expect(getCategoryForPath("reportWorkersOrdered[1].worker.name")).toBe("作業者");
    });
    it("returns その他 for unknown prefix", () => {
      expect(getCategoryForPath("unknownKey")).toBe("その他");
    });
  });

  describe("buildPlaceholderList", () => {
    it("emits only leaf paths (primitives); never object or array paths", () => {
      const context = {
        reportTitle: "Test",
        customData: { memo: "メモ", count: 1 },
      };
      const list = buildPlaceholderList(context);
      const paths = list.map(({ path }) => path);
      expect(paths).toContain("reportTitle");
      expect(paths).not.toContain("customData");
      expect(paths).toContain("customData.memo");
      expect(paths).toContain("customData.count");
    });

    it("expands primitive arrays in customData as listName[0], listName[1]", () => {
      const context = {
        reportTitle: "Test",
        customData: { tags: ["tag1", "tag2"] },
      };
      const list = buildPlaceholderList(context);
      const paths = list.map(({ path }) => path);
      expect(paths.some((p) => p === "customData.tags[0]" || p === "customData.tags[1]")).toBe(
        true
      );
    });

    it("includes category and previewValue for each item", () => {
      const context = { company: { name: "ACME" }, reportTitle: "R1" };
      const list = buildPlaceholderList(context);
      expect(list).toHaveLength(2);
      const byPath = Object.fromEntries(list.map((i) => [i.path, i]));
      expect(byPath["company.name"].category).toBe("基本情報");
      expect(byPath["company.name"].previewValue).toBe("ACME");
      expect(byPath["reportTitle"].previewValue).toBe("R1");
    });

    it("includes reportOwnedInstrumentsOrdered paths when present", () => {
      const context = {
        reportOwnedInstrumentsOrdered: [null, { ownedInstrument: { managementNumber: "MGT-001" } }],
      };
      const list = buildPlaceholderList(context);
      const paths = list.map(({ path }) => path);
      expect(paths.some((p) => p.startsWith("reportOwnedInstrumentsOrdered[1]"))).toBe(true);
      expect(paths).toContain("reportOwnedInstrumentsOrdered[1].ownedInstrument.managementNumber");
    });

    it("does not expand non-ORDERED_LIST_KEYS arrays (Ordered/ByRole only)", () => {
      const context = {
        usedPartsByCategory: {
          seal: [{ part: { name: "Gasket A" } }, { part: { name: "Gasket B" } }],
        },
      };
      const list = buildPlaceholderList(context);
      const paths = list.map(({ path }) => path);
      expect(paths).not.toContain("usedPartsByCategory.seal[0].part.name");
      expect(paths).not.toContain("usedPartsByCategory.seal[1].part.name");
    });

    it("includes createdAt (作成日) when present in context", () => {
      const context = {
        reportTitle: "Test",
        createdAt: "2024-06-15T14:30:00Z",
      };
      const list = buildPlaceholderList(context);
      const paths = list.map(({ path }) => path);
      expect(paths).toContain("createdAt");
      const item = list.find((i) => i.path === "createdAt");
      expect(item?.category).toBe("基本情報");
      expect(item?.previewValue).toBe("2024-06-15T14:30:00Z");
    });

    it("includes both loop placeholder and per-row paths for tablesOrdered[1].rows", () => {
      const context = {
        targetInstrumentPrimary: {
          tablesOrdered: [
            null,
            {
              roleKey: "m",
              rows: [
                { point: "A", value: 10 },
                { point: "B", value: 20 },
              ],
            },
          ],
        },
      };
      const list = buildPlaceholderList(context);
      const paths = list.map(({ path }) => path);
      expect(paths.some((p) => p.includes("tablesOrdered[1].rows") && !p.includes(".rows["))).toBe(
        true
      );
      const loopItem = list.find((i) => i.path === "targetInstrumentPrimary.tablesOrdered[1].rows");
      expect(loopItem?.previewValue).toBe("配列(2件)、ループ用");
      expect(paths).toContain("targetInstrumentPrimary.tablesOrdered[1].rows[0].point");
      expect(paths).toContain("targetInstrumentPrimary.tablesOrdered[1].rows[0].value");
      expect(paths).toContain("targetInstrumentPrimary.tablesOrdered[1].rows[1].point");
      expect(paths).toContain("targetInstrumentPrimary.tablesOrdered[1].rows[1].value");
      const row0Point = list.find(
        (i) => i.path === "targetInstrumentPrimary.tablesOrdered[1].rows[0].point"
      );
      expect(row0Point?.previewValue).toBe("A");
    });
  });

  describe("getPathHint", () => {
    it("returns Japanese hint for PATH_HINT_MAP entries", () => {
      expect(getPathHint("company.postalCode")).toBe("郵便番号");
      expect(getPathHint("report.reportTitle")).toBe("報告書タイトル");
      expect(getPathHint("usedPartsByCategory.seal[0].part.name")).toBe("名前");
    });
  });
});
