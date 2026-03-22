import { describe, it, expect } from "vitest";
import { z } from "zod";
import { getMasterSchema, MASTER_METADATA } from "./metadata";

describe("getMasterSchema", () => {
  it("Zod スキーマから RJSF 用の JSON Schema が正しく生成されること", () => {
    const testSchema = z.object({
      name: z.string().min(1, "必須項目"),
      department: z.string().optional(),
    });

    const result = getMasterSchema(testSchema);

    // RJSF で解釈可能な型になっているか検証
    expect(result.type).toBe("object");
    expect(result.required).toContain("name");
    // オプショナルなプロパティは required に含まれない
    expect(result.required).not.toContain("department");

    // プロパティ定義が存在するか
    expect(result.properties).toHaveProperty("name");
    expect(result.properties).toHaveProperty("department");
  });
});

describe("MASTER_METADATA", () => {
  it("各マスタのメタデータ（スキーマとカラム）が定義されていること", () => {
    const keys = [
      "companies",
      "workers",
      "sites",
      "instruments",
      "owned-instruments",
      "parts",
      "schema-definitions",
    ] as const;

    for (const key of keys) {
      const meta = MASTER_METADATA[key];
      expect(meta).toBeDefined();
      expect(meta.schema.type).toBe("object");
      expect(Array.isArray(meta.columns)).toBe(true);
      expect(meta.columns.length).toBeGreaterThan(0);
    }
  });

  it("companies のスキーマが正しい構造を持っていること", () => {
    const { schema, columns } = MASTER_METADATA["companies"];
    expect(schema.properties).toHaveProperty("name");
    expect(schema.properties).toHaveProperty("department");
    expect(schema.required).toContain("name"); // 必須項目

    // columns には ID や名前が含まれていること
    const columnKeys = columns.map((c) => c.key);
    expect(columnKeys).toContain("id");
    expect(columnKeys).toContain("name");
  });
});
