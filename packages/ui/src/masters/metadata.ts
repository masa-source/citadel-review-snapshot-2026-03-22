import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RJSFSchema } from "@rjsf/utils";
import type { MasterTableColumn } from "./MasterTable";
import {
  companySchema,
  workerSchema,
  siteSchema,
  instrumentSchema,
  partSchema,
  schemaDefinitionSchema,
} from "@citadel/types";

/** 各マスタで共通して非表示にするシステム項目（Zod） */
const commonHiddenFields = {
  id: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
};

/** 共通のシステム項目をフォームで非表示にする uiSchema */
const commonUiSchema: Record<string, { "ui:widget": string }> = {
  id: { "ui:widget": "hidden" },
  createdAt: { "ui:widget": "hidden" },
  updatedAt: { "ui:widget": "hidden" },
};

/**
 * Zod の Object スキーマから RJSF 用の JSON Schema を生成する。
 * （実運用時はラベルや説明を UI Schema と組み合わせるか、z.describe() 等で付与する）
 */
export function getMasterSchema<T extends z.ZodRawShape>(zodSchema: z.ZodObject<T>): RJSFSchema {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  });

  // ZodToJsonSchema は root 階層を "type" や "$schema" と共に出力するため、
  // RJSF が期待する object 定義の形にアサーションして返す
  return jsonSchema as RJSFSchema;
}

export type MasterMetadataKey =
  | "companies"
  | "workers"
  | "sites"
  | "instruments"
  | "owned-instruments"
  | "parts"
  | "schema-definitions"
  | "table-definitions";

export interface MasterMetadata<T = any> {
  schema: RJSFSchema;
  columns: MasterTableColumn<T>[];
  uiSchema?: Record<string, unknown>;
}

export const MASTER_METADATA: Record<MasterMetadataKey, MasterMetadata> = {
  companies: {
    schema: getMasterSchema(companySchema.extend(commonHiddenFields)),
    uiSchema: {
      ...commonUiSchema,
      name: { "ui:title": "会社名" },
      department: { "ui:title": "部署" },
      postalCode: { "ui:title": "郵便番号" },
      address: { "ui:title": "住所" },
      phone: { "ui:title": "電話番号" },
      fax: { "ui:title": "FAX" },
      email: { "ui:title": "メール" },
    },
    columns: [
      { key: "id", label: "ID", render: (c: any) => c.id ?? "-" },
      { key: "name", label: "会社名", render: (c: any) => c.name ?? "-" },
      { key: "department", label: "部署", render: (c: any) => c.department ?? "-" },
      { key: "phone", label: "電話番号", render: (c: any) => c.phone ?? "-" },
      { key: "email", label: "メール", render: (c: any) => c.email ?? "-" },
    ],
  },
  workers: {
    schema: getMasterSchema(
      workerSchema.extend({
        ...commonHiddenFields,
        companyId: z.string().optional(),
        sealImageUrl: z.string().optional(),
      })
    ),
    uiSchema: {
      ...commonUiSchema,
      companyId: {
        "ui:widget": "refSelect",
        "ui:title": "会社",
        "ui:options": { refTarget: "companies", labelKey: "name" },
      },
      sealImageUrl: { "ui:widget": "hidden" },
      name: { "ui:title": "氏名" },
    },
    columns: [
      { key: "id", label: "ID", render: (w: any) => w.id ?? "-" },
      { key: "name", label: "氏名", render: (w: any) => w.name ?? "-" },
      { key: "companyId", label: "会社", render: (w: any) => w.companyId ?? "-" },
    ],
  },
  sites: {
    schema: getMasterSchema(
      siteSchema.extend({
        ...commonHiddenFields,
        companyId: z.string().optional(),
      })
    ),
    uiSchema: {
      ...commonUiSchema,
      companyId: {
        "ui:widget": "refSelect",
        "ui:title": "会社",
        "ui:options": { refTarget: "companies", labelKey: "name" },
      },
      name: { "ui:title": "現場名" },
      location: { "ui:title": "所在地" },
      description: { "ui:title": "説明" },
    },
    columns: [
      { key: "id", label: "ID", render: (s: any) => s.id ?? "-" },
      { key: "name", label: "現場名", render: (s: any) => s.name ?? "-" },
      { key: "location", label: "所在地", render: (s: any) => s.location ?? "-" },
    ],
  },
  instruments: {
    schema: getMasterSchema(
      instrumentSchema.extend({
        ...commonHiddenFields,
        companyId: z.string().optional(),
      })
    ),
    uiSchema: {
      ...commonUiSchema,
      companyId: {
        "ui:widget": "refSelect",
        "ui:title": "会社",
        "ui:options": { refTarget: "companies", labelKey: "name" },
      },
      name: { "ui:title": "計器名" },
      modelNumber: { "ui:title": "型式" },
      maintenanceCycle: { "ui:title": "保守サイクル" },
    },
    columns: [
      { key: "id", label: "ID", render: (i: any) => i.id ?? "-" },
      { key: "name", label: "計器名", render: (i: any) => i.name ?? "-" },
      { key: "modelNumber", label: "型式", render: (i: any) => i.modelNumber ?? "-" },
    ],
  },
  "owned-instruments": {
    // OwnedInstrumentBase に合わせたスキーマ（API は camelCase）
    schema: getMasterSchema(
      z.object({
        ...commonHiddenFields,
        companyId: z.string().optional(),
        instrumentId: z.string().optional(),
        equipmentName: z.string().optional(),
        equipmentNumber: z.string().optional(),
        managementNumber: z.string().optional(),
        calAt: z.string().nullable().optional(),
        calNumber: z.string().optional(),
        instrumentType: z.string().optional(),
      })
    ),
    uiSchema: {
      ...commonUiSchema,
      companyId: {
        "ui:widget": "refSelect",
        "ui:title": "会社",
        "ui:options": { refTarget: "companies", labelKey: "name" },
      },
      instrumentId: {
        "ui:widget": "refSelect",
        "ui:title": "計器",
        "ui:options": { refTarget: "instruments", labelKey: "name" },
      },
      equipmentName: { "ui:title": "機器名" },
      equipmentNumber: { "ui:title": "機器番号" },
      managementNumber: { "ui:title": "管理番号" },
      calAt: { "ui:title": "校正日", "ui:widget": "date" },
      calNumber: { "ui:title": "校正番号" },
      instrumentType: { "ui:title": "計器種別" },
    },
    columns: [
      { key: "id", label: "ID", render: (o: any) => o.id ?? "-" },
      { key: "managementNumber", label: "管理番号", render: (o: any) => o.managementNumber ?? "-" },
      { key: "equipmentName", label: "機器名", render: (o: any) => o.equipmentName ?? "-" },
    ],
  },
  parts: {
    schema: getMasterSchema(
      partSchema.extend({
        ...commonHiddenFields,
        companyId: z.string().optional(),
      })
    ),
    uiSchema: {
      ...commonUiSchema,
      companyId: {
        "ui:widget": "refSelect",
        "ui:title": "会社",
        "ui:options": { refTarget: "companies", labelKey: "name" },
      },
      name: { "ui:title": "部品名" },
      partNumber: { "ui:title": "型番" },
    },
    columns: [
      { key: "id", label: "ID", render: (p: any) => p.id ?? "-" },
      { key: "name", label: "部品名", render: (p: any) => p.name ?? "-" },
      { key: "partNumber", label: "型番", render: (p: any) => p.partNumber ?? "-" },
    ],
  },
  "schema-definitions": {
    schema: getMasterSchema(
      schemaDefinitionSchema
        .omit({ targetEntity: true })
        .extend(commonHiddenFields)
        .extend({
          targetEntity: z.enum(["report", "targetInstrument"]),
        })
    ),
    uiSchema: {
      ...commonUiSchema,
      targetEntity: {
        "ui:title": "対象データ",
        "ui:widget": "select",
        "ui:enumNames": ["報告書 (report)", "対象機器 (targetInstrument)"],
      },
      version: { "ui:title": "バージョン" },
    },
    columns: [
      { key: "id", label: "ID", render: (s: any) => s.id ?? "-" },
      { key: "targetEntity", label: "対象データ", render: (s: any) => s.targetEntity ?? "-" },
      { key: "version", label: "バージョン", render: (s: any) => s.version ?? "-" },
    ],
  },
  "table-definitions": {
    schema: getMasterSchema(
      z.object({
        ...commonHiddenFields,
        roleKey: z.string().optional(),
        name: z.string().min(1, "必須項目"),
      })
    ),
    uiSchema: {
      ...commonUiSchema,
      roleKey: { "ui:title": "役割キー（Scout のデフォルト）" },
      name: { "ui:title": "テーブル名" },
    },
    columns: [
      { key: "id", label: "ID", render: (t: any) => t.id ?? "-" },
      { key: "name", label: "テーブル名", render: (t: any) => t.name ?? "-" },
    ],
  },
};
