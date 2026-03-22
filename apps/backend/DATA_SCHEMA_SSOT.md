# データスキーマの SSOT とフィールド追加手順

## 定義箇所（五重管理と SSOT）

新フィールド追加やバリデーション（長さ制限等）の変更時に修正・確認する箇所:

1. **Schema Metadata (Table SSOT)**: `shared/schema-metadata.json`
   - 各マスタ・テーブルのリレーション、ロール（`roles`）、同期インポート・エクスポート用の設定（`isMaster`, `items_attr`）の **唯一の正 (SSOT)**。
   - 変更後は `pnpm generate:schema` を実行して、各言語（TypeScript, Python, Dexie）の中間定数ファイルを自動更新する。

2. **Validation (Column SSOT)**: `shared/validation-rules.json`
   - 文字数制限（maxLength）や正規表現パターン（patterns）の **唯一の正 (SSOT)**。
   - 変更後は `pnpm generate:validation` を実行して、バックエンドとフロントエンド向けのバリデーション定数を自動更新する。

3. **Backend DB**: `models.py` (SQLModel)
   - PostgreSQL のテーブル定義。変更時は `pnpm db:migrate` によるマイグレーションが必要。

4. **Backend API**: `schemas.py` (Pydantic)
   - フロントエンドとの通信用型定義。ルーター内での独自定義は禁止し、すべてここに集約する。
   - `alias_generator` により JSON 側は camelCase にマッピングされる。

5. **Frontend Type (Auto-generated)**: `packages/types/src/api.generated.ts`
   - バックエンドの OpenAPI 定義から自動生成される TypeScript 型。
   - 手動修正は禁止。`pnpm generate:types` で更新する。

6. **Frontend DB**: `apps/scout/src/db/db.ts` (Dexie)
   - IndexedDB のテーブル・インデックス設定。手書きの必要はなく、`pnpm generate:schema` で生成された `DEXIE_SCHEMA` オブジェクトが自動でスプレッド展開される。

## ルール（修正漏れ・不整合の防止）

1. **バリデーションの適用**
   - 文字数制限は必ず `shared/validation-rules.json` に定義し、`schemas.py` (Pydantic) および `validation.ts` (Zod) で生成された定数（`MAX_*_LENGTH`）を使用する。

2. **Importer の自動マッピング**
   - `_schema_to_model_dict(schema_obj, Model)` を使用して payload を組み立てることで、フィールドの手動列挙を避ける。
   - 外部キー（`company_id` 等）や管理用日時（`created_at`）のみ個別に上書き・解決する。

3. **Exporter・レポートコンテキスト**
   - 出力は Pydantic の `model_dump(by_alias=True, mode='json')` で統一。
   - PDF/Excel 用のコンテキスト生成は `services.db_loader._report_to_context_dict` に集約されており、model_dump で構築された木構造を返す。

4. **命名規約**
   - Backend コード: `snake_case`
   - API / JSON / Frontend: `camelCase`
   - Pydantic の `alias_generator` により自動変換される。

## フィールド追加チェックリスト

1. `shared/schema-metadata.json` または `shared/validation-rules.json` を更新する（テーブル/制約追加時）。
2. `models.py` にカラム追加 → `pnpm db:migrate`（または alembic 直接操作）でマイグレーション。
3. `schemas.py` の Input ファクトリ（`create_input_schema(ModelBase)`）がすでに存在するか確認。ない場合は追記。特殊バリデーションのみクラス定義する。
4. 各種コードジェネレータを実行。
   - `pnpm generate:schema`
   - `pnpm generate:types`
   - `pnpm generate:validation`
5. フロント UI（Scout/Admin の `GenericDynamicForm` メタデータや個別カスタム UI）で表示・編集箇所を追加。

---

## Importer の構造と保守性

- **Phase1 マスタ（汎用 UPSERT）**
  - `services/importer/master.py` にて、ID ベースの一括 UPSERT に統一。
  - `_upsert_master_by_id()` を使い、依存関係（親テーブル）を `parent_resolvers` で指定する。
  - クライアント（Scout）側の UUID をキーとして、存在すれば UPDATE、なければ INSERT する。

- **Phase2/3 トランザクション（Report）**
  - レポートは `delete_report_cascade_logic` による上書き削除（既存 ID 時）と、子テーブルの自動カスケード削除・再登録を行う。

- **チャンクアップロード**
  - 大容量データの同期用に `UploadBegin` -> `UploadChunk` -> `UploadCommit` の 3 段階プロセスが実装済み。
  - `DatabaseInput` による一括送信も引き続きサポートされているが、基本はチャンク単位での送信を推奨。

## トランザクション管理

- API レベル（`routers/`）で `await session.commit()` を行う。
- サービス層（`services/`）では原則 `commit` せず `flush()` に留め、複数のサービスを組み合わせた際のアトミック性を確保する。
- 共通の削除ロジック（`delete_report_cascade_logic` 等）は commit なし版を共有し、API ラッパー側で commit するパターンを推奨。
