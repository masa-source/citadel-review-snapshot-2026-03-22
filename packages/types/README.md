# @citadel/types

Citadel の**共有型定義の単一情報源（Single Source of Truth）**です。

- **スキーマ**: `schema.ts` — OpenAPI 生成型の re-export（Company, Report, DatabaseSchema 等）と MissionMeta のみ手動
- **スキーマメタデータ**: `schemaRegistry.generated.ts`（TABLE_KEYS, FOREIGN_KEYS, TABLE_LABELS 等。`pnpm generate:schema` による自動生成）
- **API 型**: `api.generated.ts`（openapi-typescript で openapi.json から生成。`pnpm generate:types` で自動更新）
- **バリデーション**: `validation.ts`, `validation-rules.generated.ts`。React Hook Form と連携。
- **API クライアント**: `createApiClient`（openapi-fetch ベース。Scout / Admin で利用）

## 型の生成（完全自動化）

型やテーブルに関する情報は**手動で書かず**、メタデータファイルおよびバックエンドの OpenAPI から一括生成します。

**変更の起点**

1. スキーマ・テーブル定義の変更時は `shared/schema-metadata.json` を編集し `pnpm generate:schema` を実行します。
2. その後（あるいはバックエンド API 実装後）に、ルートから `pnpm generate:types` を実行します。

これにより、必要な OpenAPI 出力と Frontend 用の TypeScript 型更新がパイプラインを通して一括で実行されます。

## API クライアント（openapi-fetch）

`createApiClient` で openapi.json の paths に沿った型安全なクライアントを生成できます。エンドポイント変更は型エラーで検知されます。

- **Scout**: `apiClient` は `createApiClient({ baseUrl, headers, fetch: scoutFetch })` で生成。426 処理・サーバー時刻更新用のカスタム fetch を渡している。
- **Admin**: `apiClient` および SWR 用の型安全フェッチャー（fetchReports, fetchMissions 等）で CRUD 系・downloadPdf / downloadExcelZip / deleteReport を実装。

## 使い方

Scout / Admin からは **直接** `@citadel/types` を import してください。

```ts
import type { Company, Report, DatabaseSchema } from "@citadel/types";
import { TABLE_KEYS, getImportOrder } from "@citadel/types";
```

アプリ側で `export * from "@citadel/types"` のような再エクスポートは行わないでください。型の真実の源はこのパッケージのみに置き、リファクタリングを可能にします。

## スキーマ追加時（IndexedDB テーブル追加等）

1. **メタデータ定義**: `shared/schema-metadata.json` に新エンティティの定義を追加し、ルートから `pnpm generate:schema` を実行する。
2. **バックエンド**: モデル・API（Pydantic ファクトリ化によりほぼ自動）を追加。
3. **型更新**: `pnpm generate:types`（および必要に応じて `pnpm generate:validation`）を実行する。
4. **schema.ts**: 新しいエンティティ用に `export type NewEntity = Schemas["NewEntityInput"]` などを追加し、`DatabaseSchema` に登録する。

> ℹ️ 関連パッケージの `FOREIGN_KEYS` や IndexedDB スキーマ、Python 側の同期メタデータはすべて上記 1〜3 の手順内で自動生成・適用されます。
