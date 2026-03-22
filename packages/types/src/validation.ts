/**
 * フロントエンドとバックエンドで共有するバリデーション。
 * 定数は shared/validation-rules.json (SSOT) から自動生成された
 * validation-rules.generated.ts を参照する。
 * Zod スキーマを @hookform/resolvers で React Hook Form と連携する。
 */

import { z } from "zod";
import { VALIDATION_RULES } from "./validation-rules.generated";

// ----- 共通ヘルパー -----

const str = (max: number, required = false) =>
  required
    ? z.string().min(1, "必須項目です").max(max, `${max}文字以内で入力してください`)
    : z.string().max(max, `${max}文字以内で入力してください`);

/** Zod の string スキーマから max 制約の値を取得（UI の maxLength 表示用） */
export function getStringMaxLength(schema: z.ZodString): number | undefined {
  const def = schema._def as { checks?: { kind: string; value: number }[] };
  const checks = def.checks ?? [];
  const max = checks.find((c) => c.kind === "max");
  return max?.value;
}

// ----- 定数のエイリアス（読みやすさ向上） -----

const R = VALIDATION_RULES.report;
const C = VALIDATION_RULES.company;
const W = VALIDATION_RULES.worker;
const I = VALIDATION_RULES.instrument;
const TI = VALIDATION_RULES.targetInstrument;
const P = VALIDATION_RULES.part;
const S = VALIDATION_RULES.site;
const SD = VALIDATION_RULES.schemaDefinition;

// ----- レポートフォーム（scout 報告書編集） -----

export const reportFormSchema = z.object({
  // 表示用のレポート種別ラベル（例: 作業報告書）。ReportFormat.name に対応。
  reportType: z.string().max(R.reportType.maxLength),
  // 正規化されたレポート種別 ID（ReportFormat.id）。同期・PDF生成ではこちらを使用する。
  reportFormatId: z.string().optional(),
  reportTitle: str(R.reportTitle.maxLength, true),
  controlNumber: z.string().max(R.controlNumber.maxLength),
  createdAt: z.string(),
  companyId: z.string(),
  schemaId: z.string().optional(),
  clientRows: z
    .array(
      z.object({
        companyId: z.string(),
        roleKey: z.string(),
      })
    )
    .optional(),
  siteRows: z
    .array(
      z.object({
        siteId: z.string(),
        roleKey: z.string(),
      })
    )
    .optional(),
  workerRows: z
    .array(
      z.object({
        workerId: z.string(),
        workerRole: z.string(),
        roleKey: z.string(),
      })
    )
    .optional(),
  customData: z.record(z.unknown()).optional(),
});

export type ReportFormValues = z.infer<typeof reportFormSchema>;

// ----- 対象機器フォーム（scout InstrumentEdit） -----
// TargetInstrument: instrumentId / tagNumber を必須とし、その他は customData で管理。

export const instrumentFormSchema = z.object({
  instrumentId: z.string(),
  tagNumber: z.string().max(TI.tagNumber.maxLength),
  schemaId: z.string().optional(),
});

export type InstrumentFormValues = z.infer<typeof instrumentFormSchema>;

// ----- エンティティスキーマ（将来の admin / API 用） -----

export const companySchema = z.object({
  name: str(C.name.maxLength, true),
  department: z.string().max(C.department.maxLength),
  postalCode: z.string().max(C.postalCode.maxLength),
  address: z.string().max(C.address.maxLength),
  phone: z.string().max(C.phone.maxLength),
  fax: z.string().max(C.fax.maxLength),
  email: z.string().max(C.email.maxLength),
});

export const workerSchema = z.object({
  name: str(W.name.maxLength, true),
});

export const instrumentSchema = z.object({
  name: str(I.name.maxLength, true),
  modelNumber: z.string().max(I.modelNumber.maxLength),
  maintenanceCycle: z.string().max(I.maintenanceCycle.maxLength),
});

export const partSchema = z.object({
  name: str(P.name.maxLength, true),
  partNumber: z.string().max(P.partNumber.maxLength),
});

export const targetInstrumentSchema = z.object({
  tagNumber: z.string().max(TI.tagNumber.maxLength),
});

export const siteSchema = z.object({
  name: str(S.name.maxLength, true),
  location: z.string().max(S.location.maxLength),
  description: z.string().max(S.description.maxLength),
});

export const schemaDefinitionSchema = z.object({
  targetEntity: str(SD.targetEntity.maxLength, true),
  version: str(SD.version.maxLength, true),
});

// ----- Admin マスタフォーム用スキーマ（API の companyId 等を追加） -----

/** 会社マスタフォーム（companySchema をそのまま利用） */
export const companyFormSchema = companySchema;

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

/** 作業者マスタフォーム（companyId, sealImageUrl は API 専用） */
export const workerFormSchema = workerSchema.extend({
  companyId: z.string(),
  sealImageUrl: z.string(),
});

export type WorkerFormValues = z.infer<typeof workerFormSchema>;

/** 計器マスタフォーム（Admin 用。Scout の instrumentFormSchema は対象機器用で別） */
export const instrumentMasterFormSchema = instrumentSchema.extend({
  companyId: z.string(),
});

export type InstrumentMasterFormValues = z.infer<typeof instrumentMasterFormSchema>;

/** 部品マスタフォーム */
export const partFormSchema = partSchema.extend({
  companyId: z.string(),
});

export type PartFormValues = z.infer<typeof partFormSchema>;

/** 現場マスタフォーム */
export const siteFormSchema = siteSchema.extend({
  companyId: z.string(),
});

export type SiteFormValues = z.infer<typeof siteFormSchema>;

/** スキーマ定義マスタフォーム（必須は Zod で明示） */
export const schemaDefinitionFormSchema = schemaDefinitionSchema;

export type SchemaDefinitionFormValues = z.infer<typeof schemaDefinitionFormSchema>;
