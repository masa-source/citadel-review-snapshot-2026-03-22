# 技術的負債一覧

このドキュメントは、依存関係の課題・無効化コメント・未使用コード監視の方針をまとめたものです。定期的に見直し、解消状況を更新してください。

---

## 1. 依存関係

### 1.1 Frontend (pnpm)

- **@citadel/ui / shadcn**: admin と scout で共有される UI コンポーネント。Vite + React 構成に最適化済み。
- **eslint / typescript**: 各 app と packages で個別に記載。モノレポではルートで揃える運用もあり。バージョン表を README やここにまとめるとよい。
- **xlsx**: ルートの devDependencies。e2e（admin テンプレート納品テスト）で `.xlsx` ダミー生成に使用。CI・e2e 専用であることを README に記載するとよい。

### 1.2 Backend (pip)

- **pyproject.toml と requirements.txt の二重管理**: 本番・デプロイ用の依存は `pyproject.toml` の `dependencies` に集約し、`requirements.txt` は「デプロイ・ロック用」としてコメントで明記する。依存の追加・変更は pyproject.toml を正とする。
- **pyproject.toml に含めるべきパッケージ**: openpyxl, alembic, psycopg2-binary, sentry-sdk[fastapi] はコードで使用されているため、dependencies に記載する。

---

## 2. 無効化コメント（eslint / 型チェック）

以下の一覧は、プロジェクト内で `eslint-disable` や `# type: ignore` を使用している箇所と、その理由・解消方針です。

### 2.1 eslint-disable 系

| ファイル                                                       | 行    | ルール                              | 理由                                                                         | 解消方針                                                                                                         |
| -------------------------------------------------------------- | ----- | ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `scripts/generate-validation.mjs`                              | 127   | `@typescript-eslint/no-unused-vars` | 生成コード内の re-export 用変数                                              | そのままで可。コメントで「re-exported for consumers」と明記済み。                                                |
| `packages/types/src/validation-rules.generated.ts`             | 7     | 同上                                | VALIDATION_RULES が「参照のみで未使用」と誤検知される re-export              | 同上。生成コードのため手を入れない。                                                                             |
| `apps/admin/src/pages/masters/SchemaDefinitionBuilderPage.tsx` | 8, 11 | `import/no-unresolved`              | `@rjsf/core` および `@rjsf/validator-ajv8` が import resolver で解決されない | 解消検討: resolver 設定で node の `exports` を解釈させるか、このファイルのみルール例外とし理由をコメントに残す。 |

（node_modules 内の eslint-disable は対象外。）

### 2.2 type: ignore 系（Python）

| ファイル                                   | 行              | 型コード             | 理由                                                           | 解消方針                                                                                      |
| ------------------------------------------ | --------------- | -------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/backend/services/demo_data.py`       | 80, 86, 92, 100 | `reportCallIssue`    | SQLAlchemy の `select(...).where(...)` の型が pyright で未解決 | SQLAlchemy 2 の型スタブ不足。短期は理由コメントで明記。長期はスタブまたはヘルパーで吸収。     |
| `apps/backend/main.py`                     | 86              | `reportArgumentType` | FastAPI / Sentry の `_experiments` 引数型                      | スタブまたはヘルパーで吸収。短期は理由をコメントに残す。                                      |
| `apps/backend/main.py`                     | 197             | `reportArgumentType` | SQLAlchemy の `order_by` 引数型                                | 同上。                                                                                        |
| `apps/backend/services/importer/_utils.py` | 50              | `union-attr`         | `model_class.__table__.c.keys()` の ORM 動的属性               | SQLModel/ORM の型付けが難しい箇所。ヘルパー化するか、TECH_DEBT に「ORM 動的属性」として記載。 |

### 2.3 TODO / FIXME

- プロジェクト内の .ts / .tsx / .py で、`TODO` / `FIXME` / `XXX` / `HACK` を含むコメントは現状ほぼなし。
- 新規コードでは「TODO: 理由」形式で書き、必要に応じて Issue 番号を記載する運用を推奨。

---

## 3. 未使用コード・Dead Code

- **クリーンアップ状況 (2026-02-27)**:
  - 大規模な静的解析とリファクタリングを実施し、以下のデッドコードを完全に排除しました。
    - **未使用の定数**: `shared/validation-rules.json` の未使用パターン、`conftest.py` の未使用なテスト用 UUID。
    - **過剰なエクスポート**: `monitoring` パッケージの `captureError`、`offline.ts` のエラーメッセージ定数などのエクスポートを内部化。
    - **重複実装**: `report_api_service.py` と `importer` で重複していた削除ロジックを共通化。
    - **未使用型定義**: `ErrorCode` 型をエラーハンドリングに適用し、型安全性を向上。
    - **古いテストモック**: openapi-fetch 移行後に残っていた旧 `api` オブジェクトのモックを削除。
- **今後の監視**:
  - **Ruff (Backend)**: 未使用 import や定義のチェックが CI に組み込まれており、自動修正 (`pnpm fix`) で維持されます。
  - **Knip (Frontend/Shared)**: TypeScript の未使用 export やファイル、不要な依存パッケージの検出を CI に導入済みです。`knip.json` で管理されています。
  - **Bandit (Backend Security)**: Python のセキュリティ脆弱性（ハードコードされたパスワード等）を検知するスキャンを導入済みです。

---

## 4. その他

- **解消の優先順位**: (1) 各無効化コメントに「なぜ無効か」を 1 行で残す、(2) 本ドキュメントで一覧を維持、(3) 中期で admin の `import/no-unresolved` 解消や Python の type: ignore 削減に取り組む。

- **レポートコンテキストの型**: レポートコンテキスト（`load_report_context` の戻り値・Jinja2/Excel 置換に渡す辞書）は、以前の TypedDict から、Pydantic V2 ベースの `services.context_models.ReportContextRoot` へリファクタリング完了済みです。
  - SQLAlchemy の Lazy Loading エラー防止のため、`db_loader.py` 内で `_extract_loaded` を通す仕組みになっています。
  - Jinja2 等への引き渡し時には、依然として `model_dump(by_alias=True, mode='python')` を経由した辞書を用いることで、既存の実装への影響を抑えつつ型安全性を確保しています。

- **スキーマ・リレーションの二重/三重管理（解消済み）**: 以前はフロントエンド（Dexie, TS config）とバックエンド（schemas, router, DB mapping）の各所にテーブル間リレーションや依存関係が散在していました。現在は `shared/schema-metadata.json` を SSOT とし、`pnpm generate:schema` により各言語のコードベースへ自動展開させるアーキテクチャに完全移行し、この負債は解消されています。

---

_最終更新: 調査レポート承認に基づき初版作成。Phase 2 でレポートコンテキスト TypedDict 化を反映。_
