/**
 * @citadel/types - Citadel 共有型定義パッケージ
 *
 * 型は openapi.json → openapi-typescript → api.generated.ts から生成。
 * schema はその re-export と DatabaseSchema / MissionMeta のみ手動。
 */

// 生成スキーマのエイリアス・DatabaseSchema・MissionMeta（schema.ts）
export * from "./schema";
// スキーマの単一情報源（TABLE_KEYS, FOREIGN_KEYS, getImportOrder, TABLE_LABELS）
export * from "./schemaRegistry";

// OpenAPI から自動生成された API 型
export * from "./api.generated";

// 共有バリデーションルール（SSOT: shared/validation-rules.json → 自動生成定数）
export * from "./validation-rules.generated";
export * from "./validation";

// customData の境界パース（Parse, don't validate）
export * from "./customData";

// API エラーコード（バックエンドと値の一致を要する）
export * from "./errorCodes";

// 型安全 API クライアント（openapi-fetch ベース）
export {
  createApiClient,
  getApiBaseUrl,
  type ApiClient,
  type CreateApiClientOptions,
} from "./createApiClient";
