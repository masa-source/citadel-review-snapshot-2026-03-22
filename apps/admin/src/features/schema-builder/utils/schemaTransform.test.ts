import { describe, it, expect } from "vitest";
import {
  builderFieldsToJsonSchema,
  builderFieldsToUiSchema,
  schemasToBuilderFields,
} from "./schemaTransform";
import type { BuilderField } from "../types";

describe("schemaTransform", () => {
  const sampleFields: BuilderField[] = [
    { id: "name", fieldType: "text", title: "氏名", required: true },
    { id: "memo", fieldType: "textarea", title: "メモ", description: "自由記述" },
    { id: "count", fieldType: "number", title: "数量" },
    { id: "dueDate", fieldType: "date", title: "期限" },
    { id: "status", fieldType: "dropdown", title: "状態", enum: ["未着手", "進行中", "完了"] },
    { id: "done", fieldType: "checkbox", title: "完了" },
  ];

  describe("builderFieldsToJsonSchema", () => {
    it("generates type: object with properties and required", () => {
      const schema = builderFieldsToJsonSchema(sampleFields);
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      expect((schema.required as string[]).includes("name")).toBe(true);
      expect((schema.required as string[]).length).toBe(1);
    });

    it("maps each fieldType to correct JSON Schema type", () => {
      const schema = builderFieldsToJsonSchema(sampleFields);
      const props = schema.properties as Record<string, Record<string, unknown>>;
      expect(props.name.type).toBe("string");
      expect(props.memo.type).toBe("string");
      expect(props.count.type).toBe("number");
      expect(props.dueDate.type).toBe("string");
      expect(props.dueDate.format).toBe("date");
      expect(props.status.type).toBe("string");
      expect(props.status.enum).toEqual(["未着手", "進行中", "完了"]);
      expect(props.done.type).toBe("boolean");
    });

    it("includes title and description", () => {
      const schema = builderFieldsToJsonSchema(sampleFields);
      const props = schema.properties as Record<string, Record<string, unknown>>;
      expect(props.name.title).toBe("氏名");
      expect(props.memo.description).toBe("自由記述");
    });

    it("skips fields with empty id", () => {
      const withEmpty = [
        ...sampleFields.slice(0, 1),
        { id: "", fieldType: "text" as const, title: "Skip" },
      ];
      const schema = builderFieldsToJsonSchema(withEmpty);
      const props = schema.properties as Record<string, unknown>;
      expect(Object.keys(props)).toContain("name");
      expect(Object.keys(props).length).toBe(1);
    });
  });

  describe("builderFieldsToUiSchema", () => {
    it("outputs ui:order at root with ids in array order", () => {
      const ui = builderFieldsToUiSchema(sampleFields);
      expect(ui["ui:order"]).toEqual(["name", "memo", "count", "dueDate", "status", "done"]);
    });

    it("sets ui:widget for textarea and date", () => {
      const ui = builderFieldsToUiSchema(sampleFields);
      expect((ui.memo as Record<string, unknown>)["ui:widget"]).toBe("textarea");
      expect((ui.dueDate as Record<string, unknown>)["ui:widget"]).toBe("date");
    });

    it("does not set ui:widget for text, number, dropdown, checkbox", () => {
      const ui = builderFieldsToUiSchema(sampleFields);
      expect(ui.name).toBeUndefined();
      expect(ui.count).toBeUndefined();
      expect(ui.status).toBeUndefined();
      expect(ui.done).toBeUndefined();
    });
  });

  describe("schemasToBuilderFields", () => {
    it("restores BuilderField[] from generated schema", () => {
      const jsonSchema = builderFieldsToJsonSchema(sampleFields);
      const uiSchema = builderFieldsToUiSchema(sampleFields);
      const restored = schemasToBuilderFields(jsonSchema, uiSchema);
      expect(restored.length).toBe(sampleFields.length);
      expect(restored.map((f) => f.id)).toEqual(sampleFields.map((f) => f.id));
      expect(restored.map((f) => f.fieldType)).toEqual(sampleFields.map((f) => f.fieldType));
      expect(restored[0].required).toBe(true);
      expect(restored[4].enum).toEqual(["未着手", "進行中", "完了"]);
    });

    it("respects ui:order when present and sorts BuilderField[] accordingly", () => {
      const reversed = [...sampleFields].reverse();
      const jsonSchema = builderFieldsToJsonSchema(reversed);
      const uiSchema = builderFieldsToUiSchema(reversed);
      expect(uiSchema["ui:order"]).toEqual(["done", "status", "dueDate", "count", "memo", "name"]);
      const restored = schemasToBuilderFields(jsonSchema, uiSchema);
      expect(restored.map((f) => f.id)).toEqual([
        "done",
        "status",
        "dueDate",
        "count",
        "memo",
        "name",
      ]);
    });

    it("restores array with items string as fieldType list", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" }, title: "タグ" },
        },
      };
      const uiSchema = { "ui:order": ["tags"] };
      const restored = schemasToBuilderFields(jsonSchema, uiSchema);
      expect(restored.length).toBe(1);
      expect(restored[0].id).toBe("tags");
      expect(restored[0].fieldType).toBe("list");
    });

    it("returns empty array when properties is missing", () => {
      expect(schemasToBuilderFields({ type: "object" }, {})).toEqual([]);
      expect(schemasToBuilderFields(null, {})).toEqual([]);
    });

    it("falls back to text for unknown type", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          custom: { type: "string", title: "Custom", description: "unknown widget" },
        },
      };
      const uiSchema = { "ui:order": ["custom"], custom: { "ui:widget": "custom-widget" } };
      const restored = schemasToBuilderFields(jsonSchema, uiSchema);
      expect(restored.length).toBe(1);
      expect(restored[0].fieldType).toBe("text");
    });
  });

  describe("round-trip", () => {
    it("preserves field types and order through builderFields -> schema -> builderFields", () => {
      const jsonSchema = builderFieldsToJsonSchema(sampleFields);
      const uiSchema = builderFieldsToUiSchema(sampleFields);
      const restored = schemasToBuilderFields(jsonSchema, uiSchema);

      expect(restored.length).toBe(sampleFields.length);
      for (let i = 0; i < sampleFields.length; i++) {
        expect(restored[i].id).toBe(sampleFields[i].id);
        expect(restored[i].fieldType).toBe(sampleFields[i].fieldType);
        expect(restored[i].title).toBe(sampleFields[i].title);
        expect(restored[i].description).toBe(sampleFields[i].description);
        expect(Boolean(restored[i].required)).toBe(Boolean(sampleFields[i].required));
        expect(restored[i].enum).toEqual(sampleFields[i].enum);
      }
    });

    it("round-trip with custom order preserves ui:order", () => {
      const customOrder: BuilderField[] = [
        { id: "c", fieldType: "text", title: "C" },
        { id: "a", fieldType: "number", title: "A" },
        { id: "b", fieldType: "checkbox", title: "B" },
      ];
      const jsonSchema = builderFieldsToJsonSchema(customOrder);
      const uiSchema = builderFieldsToUiSchema(customOrder);
      const restored = schemasToBuilderFields(jsonSchema, uiSchema);
      expect(restored.map((f) => f.id)).toEqual(["c", "a", "b"]);
    });
  });
});
