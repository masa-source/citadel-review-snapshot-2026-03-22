/**
 * 型定義は OpenAPI (openapi.json) → openapi-typescript → api.generated.ts から生成。
 * このファイルは生成スキーマのエイリアスと、OpenAPI にない最小限の型のみ定義する。
 * API の optional フィールドは OpenAPI 仕様に従い null 許容のまま利用する。
 */

import type { components } from "./api.generated";

type Schemas = components["schemas"];

// --- エンティティ型（生成スキーマをそのままエクスポート。null は API 仕様に従う）---

export type Company = Schemas["CompanyInput"];
export type CompanyCreate = Schemas["CompanyCreate"];
export type CompanyUpdate = Schemas["CompanyInput"];
export type Worker = Schemas["WorkerInput"];
export type WorkerCreate = Schemas["WorkerCreate"];
export type WorkerUpdate = Schemas["WorkerInput"];
export type Instrument = Schemas["InstrumentInput"];
export type SchemaDefinition = Schemas["SchemaDefinitionInput"];
export type Site = Schemas["SiteInput"];
export type Part = Schemas["PartInput"];
export type OwnedInstrument = Schemas["OwnedInstrumentInput"];
/** ReportInput + Scout で利用するスナップショット・ローカル未同期フラグ */
export type Report = Schemas["ReportInput"] & {
  updatedAt?: string | null;
  reportSnapshot?: Record<string, unknown> | null;
  /** Scout: 未同期の新規レポートであることを示す（IndexedDB のみに存在） */
  isLocal?: boolean;
};
export type ReportClient = Schemas["ReportClientInput"];
export type ReportSite = Schemas["ReportSiteInput"];
export type ReportWorker = Schemas["ReportWorkerInput"];
export type TargetInstrument = Schemas["TargetInstrumentInput"];
export type TableDefinition = Schemas["TableDefinitionInput"];
export type TargetInstrumentTable = Schemas["TargetInstrumentTableInput"];
export type UsedPart = Schemas["UsedPartInput"];
export type ReportOwnedInstrument = Schemas["ReportOwnedInstrumentInput"];

/** レポート種別（Sync で配信。OpenAPI の ReportFormatCreate と同形） */
export type ReportFormat = { id: string; name?: string | null };

/** レポート一覧表示用 */
export type ReportListItem = Schemas["ReportListItem"];

/** エクスポート/ハンドオフ API のリクエスト型。admin のフォーム等はこの型に合わせると API 変更時の型ずれを防げる。 */
export type ExportRequest = Schemas["ExportRequest"];

// --- db.json ルート構造（インポート/エクスポート用）---

/** フロントエンド db.json のルート型。配列は必須。 */
export interface DatabaseSchema {
  companies: Company[];
  workers: Worker[];
  instruments: Instrument[];
  schemaDefinitions: SchemaDefinition[];
  sites: Site[];
  parts: Part[];
  ownedInstruments: OwnedInstrument[];
  tableDefinitions: TableDefinition[];
  reportFormats: ReportFormat[];
  reports: Report[];
  reportSites: ReportSite[];
  reportClients: ReportClient[];
  reportWorkers: ReportWorker[];
  targetInstruments: TargetInstrument[];
  targetInstrumentTables: TargetInstrumentTable[];
  usedParts: UsedPart[];
  reportOwnedInstruments: ReportOwnedInstrument[];
}

/** テーブルキー K に対応する 1 行の型。dbImporter 等の動的テーブル処理で使用。 */
export type TableRow<K extends keyof DatabaseSchema> = DatabaseSchema[K][number];

// --- 任務メタデータ（Handoff 用・OpenAPI にないため手動定義）---

export interface MissionMeta {
  missionId: string;
  permission: "Edit" | "View" | "Collect" | "Copy";
  issuedAt: string;
  expiresAt: string;
  status?: string;
}
