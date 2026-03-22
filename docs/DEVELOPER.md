# 開発者向け補足（.cursorrules から移行した項目）

ルートの [README](../README.md) にコマンド一覧・クイックスタート・ディレクトリ構成がある。ここでは .cursorrules から移した参照用の詳細をまとめる。

## 起動・停止スクリプト

README の「コマンド一覧」「個別スクリプト」を参照。起動・停止は **Node.js + zx** のスクリプト（`scripts/*.mjs`）をルートの pnpm コマンドから実行する。

- 起動: `pnpm start`（`zx ./scripts/start-all.mjs`）
- 停止: `pnpm stop`（`zx ./scripts/stop-all.mjs`）
- 本番: `pnpm start:prod`（`zx ./scripts/start-prod.mjs`）
- デモ: `pnpm demo:seed` / `pnpm demo:clear`（`scripts/demo-seed.mjs`, `scripts/demo-clear.mjs`）

## 型・スキーマ・メタデータの同期（最重要）

バックエンドのスキーマ変更や、マスタテーブルの追加・制約の修正を行った場合は、以下の各自動生成コマンドを実行して全体を同期させてください。
（これらにより、バックエンドの Pydantic ファクトリやフロントの Dexie DB バージョン、中間メタデータが自動連携します。）

- **`pnpm generate:schema`**: `shared/schema-metadata.json` から、フロント(Dexie, TS)およびバックエンド向けの静的構成ファイルを生成します。
- **`pnpm generate:validation`**: `shared/validation-rules.json`（SSOT）から、文字数や正規表現等の制約を FE(Zod等)/BE(Pydantic等) 向けに定数出力します。
- **`pnpm generate:types`**: バックエンドが出力する OpenAPI スキーマから、フロントエンドの TypeScript API 型（`packages/types/src/api.generated.ts`）を再生成します。CI ではコミット済みファイルとの不一致がチェックされます。

## 環境変数（参照用）

| 変数名                                          | 説明                                                                                                    | 備考                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------- |
| `DATABASE_URL`                                  | PostgreSQL 接続 URL                                                                                     | docker-compose 参照        |
| `TEMPLATE_DIR`                                  | テンプレートディレクトリ名                                                                              | デフォルト `template`      |
| `POSTGRES_*`                                    | DB ユーザー/パスワード/DB名                                                                             | 開発は docker-compose 準拠 |
| `SQL_ECHO`                                      | SQL ログ                                                                                                | `true`/`false`             |
| `ALLOWED_ORIGINS`                               | CORS 許可オリジン                                                                                       | カンマ区切り               |
| `CITADEL_ENV_FILE` / `CITADEL_COMPOSE_OVERRIDE` | 本番用外部パス                                                                                          | 本番のみ                   |
| Sentry                                          | `VITE_SENTRY_DSN_*` / `VITE_SENTRY_ENVIRONMENT`（フロント）、`SENTRY_DSN_BACKEND`, `SENTRY_ENVIRONMENT` | 任意                       |
| API キー                                        | `REQUIRE_API_KEY`, `API_KEY_*`, `VITE_API_KEY_*`（Scout/Admin は Vite の `import.meta.env` で参照）     | 本番で使用                 |

本番の機密情報はプロジェクト外で管理している。`.env.example` と `docker-compose.override.yml.example` は、公開可能な参照用サンプルとしてリポジトリ内に含めている。

## デモデータ

- `pnpm demo:seed` / `pnpm demo:clear` / `pnpm demo:reset`
- データは `[DEMO]` プレフィックス付き。削除はそのデータのみ。実装: `apps/backend/services/demo_data.py`、Admin の `/demo-data/`、`scripts/demo-seed.mjs` / `scripts/demo-clear.mjs`

## PWA 更新通知（Scout）

Service Worker が新バージョンを検出すると画面下部にバナー表示。1 時間ごとにチェック。関連: `useServiceWorker.ts`, `UpdateNotification.tsx`, `service-worker/index.ts`。

## Sentry / API キー

- Sentry: 各アプリに `reportError` / `captureSyncError` あり。`feature` タグで `sync` / `report` / `master` 等を指定。
  - **フロントエンド**: 環境変数は `VITE_SENTRY_DSN_*` / `VITE_SENTRY_ENVIRONMENT`（Vite の `import.meta.env` で参照）。
  - **CI 連携**: ソースマップの自動アップロードには GitHub Secrets に `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` の設定が必要です。
- API キー: `REQUIRE_API_KEY=true` で本番必須。キーは `X-API-Key` で送信。Backend: `auth.py`, `main.py`。Scout/Admin はクライアントで環境変数から自動付与。

## E2E（Playwright）

- `pnpm test:e2e` / `pnpm test:e2e:scout` / `pnpm test:e2e:admin` / `pnpm test:e2e:ui` / `pnpm test:e2e:report`
- 構成: `e2e/scout/`, `e2e/admin/`, `playwright.config.ts`。モバイル: `pnpm test:e2e --project=scout-mobile`
- **前提**: サービスは自動起動しない。**事前に別ターミナルで `pnpm start` を実行し、Backend(8000) / Scout(3000) / Admin(3001) を起動した状態で** `pnpm test:e2e` を実行すること。globalSetup は 3 つのサービスが応答するか確認するのみで、Docker やプロセスは起動しない。未起動の場合はエラーメッセージで案内し終了する。**CI 環境**では Backend のみ起動確認し、Scout/Admin は Playwright の webServer が各プロジェクトで起動する。
- **CI レポート**: CI で実行された E2E テストのレポートは自動的に GitHub Pages にデプロイされます。リポジトリ設定の `Pages` で `gh-pages` ブランチをソースとして選択してください。

## AI テンプレート自動生成の手動 E2E 確認

「AIにおまかせ生成（Beta）」がブラウザから正常に完了するかを手動で確認する手順。回帰確認や LM Studio 連携の検証に利用する。

1. **バックエンドを起動**: `pnpm start` で全サービス、または Backend を単体で起動し、API を `http://localhost:8000` で利用可能にする。
2. **LM Studio を起動**: モデル（例: `qwen/qwen3.5-9b`）を読み込み、Local Server を `http://localhost:1234/v1` で起動する。
3. **環境変数**: バックエンドの `.env` で `AI_API_BASE_URL` / `AI_MODEL_NAME` / `AI_API_KEY` が LM Studio を指していることを確認する。
4. **Admin を起動**: `pnpm start` で Admin を起動し、ブラウザでテンプレート一覧を開く。
5. **手順**:
   - `apps/backend/tests/fixtures/sample_complex_report.xlsx` を選択する。
   - 表示名を入力する。
   - 「AIにおまかせ生成（Beta）」を押す。
   - ローディング表示ののち、正常完了しテンプレート一覧に新規テンプレートが追加されることを確認する。

バックエンドまたは LM Studio が止まっていると 422 / 500 やタイムアウトになる。API 単体の正常系は `apps/backend/tests/api/test_templates_auto_generate.py`（AI モック）で検証する。

## Git / CI

- コミット規約: Conventional Commits（`feat: message`）。
- **`pnpm fix`**: コミット前に実行することで、フロントエンドの Lint/Format およびバックエンドの Ruff チェックを一括で実行・自動修正します。
- **`pnpm ci:local` (pre-push)**: `git push` 時に自動実行されます。Dagger で Postgres + Node/Python 環境を立て、lint / build / バックエンドテストを一括で行い、失敗した場合は Push をブロックします。※ci:local には E2E テストは含まれません。E2E や型同期の完全チェックは `pnpm validate` で手動実行可能。
- **ローカル CI (Dagger)**: `pnpm ci:local` で Dagger による Postgres + Node/Python 環境での lint/build/test を実行可能（E2Eテストは含まない）。`pnpm ci:reset` はキャッシュ削除後に同パイプラインを実行し、不調時のリセットに利用する。
- CI: `.github/workflows/ci.yml`。main への push/PR で各種テスト、静的解析（Knip, Bandit, Audit 含む）、Sync Check、デプロイが並列で走ります。
- Dependabot: `.github/dependabot.yml` で週次 PR 自動作成。

## チャンクアップロード（同期機能）

- 実装: `apps/backend/routers/sync.py`, `apps/backend/schemas.py`。
- 大容量データの同期用に `UploadBegin` -> `UploadChunk` -> `UploadCommit` の 3 段階プロセスが実装されています。これにより、メモリ消費を抑えた安定したデータ転送が可能です。

## 簡易設計台（Lite Drafting Table）

Admin のテンプレートセル編集・プレースホルダ（`{{ path }}`）挿入。API: `GET/POST /api/templates/{id}/grid`（0-based グリッド）。実装: `apps/backend/services/template_editor.py`, `main.py`, Admin `templates/drafting/[id]/page.tsx`, `JsonTree.tsx`。openpyxl は 1 始まりで API は 0 始まり。

## バックエンド utils

- `utils/date_utils.py`: ISO 日時パース等（`parse_iso_to_utc_naive` 等）
- `utils/quarantine.py`: アップロード Excel の検疫（マクロ等検出）

## 共通設定パッケージ（Prettier / TypeScript / ESLint / Tailwind）

フロントエンドの設定はモノレポ内で一元化している。参照方法・プリセット一覧は [docs/SHARED_CONFIG.md](SHARED_CONFIG.md) を参照。

- **Prettier**: ルート `.prettierrc` のみ。各アプリは持たない。
- **TypeScript**: `@citadel/typescript-config` の `base.json` / `library.json` 等を各 `tsconfig.json` で `extends`。Scout と Admin は **Vite 移行済み**のため `base.json` を継承。
- **ESLint**: `@citadel/eslint-config` の `base.js` / `vite-react.js` / `vite-react-import.js` / `library.js` を各 `.eslintrc.json` で `extends`。
- **Tailwind**: `@citadel/tailwind-config` を各アプリの `tailwind.config` の `presets` で読み込み。

## .cursorrules / ドキュメント更新

- 大きな機能追加・アーキテクチャ変更後、全テスト通過を確認したうえで .cursorrules のレビューを検討する。
- 新規コマンド・ディレクトリ構成・技術スタック・ポート・セットアップ・トラブルシューティングを変更した場合は README 等を更新する。
