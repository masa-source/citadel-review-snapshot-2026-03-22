# Citadel Review Snapshot

このディレクトリは、未踏アドバンスト審査向けに切り出した `Citadel` の公開用スナップショットです。

審査員が確認できること:

- モノレポ全体の構成と、`Admin` / `Scout` / `Backend` の役割分担
- 共有型・共有設定・生成スクリプトを含む開発基盤
- テスト、CI、ローカル検証、テンプレート編集、オフライン対応の実装導線
- 公開可能な範囲のドキュメント、設定ファイル、主要ソースコード

このスナップショットに含めていないもの:

- `.env` などの機密設定
- 実データ、提出用 PDF、作業メモ、面接想定問答、分析メモ
- ローカル生成物、キャッシュ、レポート出力、IDE 用設定

まず読むと分かりやすい順番:

1. この `README.md`
2. `docs/DEVELOPER.md`
3. `apps/backend/`, `apps/admin/`, `apps/scout/`
4. `packages/`, `shared/`, `scripts/`
5. `.github/workflows/ci.yml`

以下は、元プロジェクトの開発者向け README をベースに、審査用スナップショットでもそのまま参照できる内容を残したものです。

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                         Citadel                             │
├─────────────────────────────────────────────────────────────┤
│  apps/                                                      │
│  ├── scout/     Vite + React PWA (現場用) - port 3000           │
│  ├── admin/     Vite + React (管理画面)   - port 3001           │
│  └── backend/   FastAPI              - port 8000           │
├─────────────────────────────────────────────────────────────┤
│  packages/                                                  │
│  └── types/     共有 TypeScript 型定義                      │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (Docker)                 - port 5432           │
└─────────────────────────────────────────────────────────────┘
```

## クイックスタート

### 前提条件

- Node.js >= 18.0.0
- pnpm
- Python >= 3.11
- Docker Desktop

### 初回セットアップ

```powershell
# 依存関係インストール
pnpm install

# Python 仮想環境セットアップ（※ 実環境にインストールしないこと）
python -m venv venv
.\venv\Scripts\activate
pip install -r apps/backend/requirements.txt
pip install pytest pytest-asyncio pytest-cov pytest-xdist bandit httpx aiosqlite ruff
```

**注意**: バックエンドの Python 依存はかならず上記の仮想環境（venv）内でインストール・実行してください。`.\venv\Scripts\activate` を忘れるとシステムの Python にインストールされ、プロジェクトが重くなったりテストが不安定になったりします。

### 起動（開発モード）

```bash
# 全サービス起動（DB, Backend, Admin, Scout）
pnpm start
```

### スナップショットでの注意

このスナップショットには、本番用の機密設定や実データは含めていません。そのため、審査用途では主に **構成確認、コード確認、準実行の追跡** を目的としてください。`.env.example`、`docker-compose.yml`、`docs/DEVELOPER.md` を併せて見ると、必要な前提条件を追いやすくなります。

## コマンド一覧

### 起動・停止

| コマンド          | 説明                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `pnpm start`      | 全サービス起動（DB, Backend, Admin, Scout）                                   |
| `pnpm start:prod` | 本番モードで全サービス起動                                                    |
| `pnpm stop`       | Backend / Admin / Scout / PostgreSQL をまとめて停止（PID ベースで安全に停止） |
| `pnpm restart`    | 全サービス再起動                                                              |
| `pnpm status`     | サービス状態確認（PID 情報とポート状態を表示し、想定外ポート利用も簡易検出）  |

### データベース

| コマンド          | 説明                                    |
| ----------------- | --------------------------------------- |
| `pnpm db:up`      | PostgreSQL のみ起動（バックグラウンド） |
| `pnpm db:down`    | PostgreSQL 停止                         |
| `pnpm db:reset`   | データベース初期化（全データ削除）      |
| `pnpm db:migrate` | マイグレーション適用                    |

### マイグレーション（Alembic）

```bash
# マイグレーション適用
pnpm db:migrate

# 新しいマイグレーション作成（スキーマ変更後）
pnpm db:migrate -- --generate --message "add_new_column"

# 1つ前にダウングレード
pnpm db:migrate -- --downgrade
```

### 開発

| コマンド            | 説明                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm dev:scout`    | Scout のみ起動 (port 3000)                                                                      |
| `pnpm dev:admin`    | Admin のみ起動 (port 3001)                                                                      |
| `pnpm build`        | 全アプリビルド                                                                                  |
| `pnpm lint`         | 全アプリ Lint（Frontend）                                                                       |
| `pnpm lint:backend` | Backend の ruff（CI と同等）                                                                    |
| `pnpm fix`          | 全アプリの Lint 自動修正（FE/BE 両方）                                                          |
| `pnpm validate`     | Push 前の全項目チェック（テスト・ビルド・型）                                                   |
| `pnpm ci:local`     | ローカル CI（Dagger: GHA の挙動を再現。静的解析・ビルド・DB検証・BEテスト。※E2Eテストは非実行） |
| `pnpm ci:reset`     | キャッシュ削除後にローカル CI をフル実行（不調時のリセット用）                                  |

### テスト

| コマンド              | 説明                             |
| --------------------- | -------------------------------- |
| `pnpm test:backend`   | Backend テスト（カバレッジ付き） |
| `pnpm test:e2e`       | E2E テスト（全プロジェクト）     |
| `pnpm test:e2e:scout` | E2E テスト（Scout のみ）         |
| `pnpm test:e2e:admin` | E2E テスト（Admin のみ）         |
| `pnpm test:e2e:ui`    | E2E テスト（UI モード）          |

E2E を初めて実行する場合は、事前に `pnpm exec playwright install` でブラウザをインストールしてください。**E2E はサービスを自動起動しません。** 別ターミナルで `pnpm start` を実行して Backend / Scout / Admin を起動したうえで、`pnpm test:e2e` を実行してください（例: ターミナル1で `pnpm start` → 起動完了後、ターミナル2で `pnpm test:e2e`）。未起動の場合は globalSetup がエラーで終了します。フロント単体テストは `pnpm -F @citadel/scout exec vitest run` および `pnpm -F @citadel/admin exec vitest run` で watch なし実行できます。※CI 環境ではサービスの起動とヘルスチェックが自動化されています。

### スキーマと型の自動生成

| コマンド                   | 説明                                            |
| -------------------------- | ----------------------------------------------- |
| `pnpm generate:schema`     | メタデータから各層の DB 構成ファイルを自動生成  |
| `pnpm generate:types`      | OpenAPI から TypeScript 型を自動生成            |
| `pnpm generate:validation` | JSONルールからFE/BE向けバリデーション定数を生成 |

### デモデータ

| コマンド          | 説明                                          |
| ----------------- | --------------------------------------------- |
| `pnpm demo:seed`  | デモデータを投入（[DEMO] プレフィックス付き） |
| `pnpm demo:clear` | デモデータを削除（[DEMO] データのみ）         |
| `pnpm demo:reset` | デモデータをリセット（削除→投入）             |

### 個別スクリプト

現在は **Node.js + zx ベースのスクリプト**を公式ルートとしています。OS を問わず同じコマンドで実行できます。

```bash
pnpm start           # zx ./scripts/start-all.mjs を実行
pnpm start:prod      # zx ./scripts/start-prod.mjs を実行
pnpm stop            # zx ./scripts/stop-all.mjs を実行
pnpm restart         # zx ./scripts/restart-all.mjs を実行
pnpm status          # zx ./scripts/status.mjs を実行
pnpm db:reset        # zx ./scripts/db-reset.mjs を実行
pnpm ci:local        # node scripts/ci-wrapper-fast.mjs（Dagger ローカル CI。※E2E テストは含まない）
pnpm ci:reset        # node scripts/ci-wrapper.mjs（クリーンアップ後に Dagger ローカル CI）
pnpm test:backend    # zx ./scripts/test-backend.mjs を実行
pnpm generate:schema # zx ./scripts/generate-schema.mjs を実行
pnpm generate:types  # zx ./scripts/generate-types.mjs を実行
pnpm generate:validation # zx ./scripts/generate-validation.mjs を実行
pnpm demo:seed       # zx ./scripts/demo-seed.mjs を実行
pnpm demo:clear      # zx ./scripts/demo-clear.mjs を実行
```

## アクセス URL

| アプリ      | URL                        | 説明                         |
| ----------- | -------------------------- | ---------------------------- |
| Scout       | http://localhost:3000      | 現場用 PWA（オフライン対応） |
| Admin       | http://localhost:3001      | 管理画面                     |
| Backend API | http://localhost:8000      | REST API                     |
| API Docs    | http://localhost:8000/docs | Swagger UI                   |

## ディレクトリ構成

```
citadel/
├── apps/
│   ├── backend/              # FastAPI バックエンド
│   │   ├── main.py           # エンドポイント定義
│   │   ├── models.py         # SQLModel 定義
│   │   ├── schemas.py        # Pydantic スキーマ
│   │   ├── services/         # ビジネスロジック（template_editor 等）
│   │   ├── utils/            # ユーティリティ（date_utils, quarantine 等）
│   │   └── tests/            # テスト
│   ├── scout/                # Vite + React PWA（現場用）
│   │   └── src/
│   │       ├── routes/        # 画面コンポーネント（React Router）
│   │       ├── components/   # UI コンポーネント
│   │       ├── db/           # Dexie (IndexedDB)
│   │       ├── hooks/        # カスタムフック
│   │       └── utils/        # ユーティリティ
│   └── admin/                # Vite + React（管理画面）
│       └── src/routes/        # 画面コンポーネント（React Router）
├── packages/
│   ├── types/                # 共有 TypeScript 型定義
│   │   └── src/
│   ├── ui/                   # 共有 UI コンポーネント
│   ├── monitoring/           # エラー監視・Sentry 共通（reportError 等）
│   ├── typescript-config/    # 共通 TypeScript 設定（各 tsconfig が extends）
│   ├── eslint-config/        # 共通 ESLint 設定（各 .eslintrc が extends）
│   └── tailwind-config/      # 共通 Tailwind 設定（preset）
├── docs/                     # 静的ドキュメント（本番・ネットワーク・Handoff 等）
│   └── SHARED_CONFIG.md      # 共通設定パッケージの参照方法
├── e2e/                      # E2E テスト (Playwright)
├── scripts/                  # 起動・停止スクリプト
├── venv/                     # Python 仮想環境
├── .cursorignore             # AIエージェントからの保護設定
├── .gitattributes            # 改行コード（LF）統一・同期保護設定
├── .gitignore                # Git追跡からの除外設定
├── docker-compose.yml        # PostgreSQL
├── package.json              # pnpm workspaces
├── pnpm-workspace.yaml       # ワークスペース設定
└── turbo.json                # Turborepo 設定
```

## 技術スタック

| レイヤー       | 技術                                                 |
| -------------- | ---------------------------------------------------- |
| Backend        | FastAPI, SQLModel, Pydantic v2, asyncpg              |
| Database       | PostgreSQL 15 (Docker)                               |
| Frontend       | Vite 6, React 19, TypeScript, Tailwind CSS           |
| Local DB       | Dexie.js (IndexedDB)                                 |
| PWA            | vite-plugin-pwa（Scout）                             |
| Monorepo       | pnpm workspaces, Turborepo                           |
| Testing        | pytest, Vitest, Playwright (E2E)                     |
| Linting        | ESLint, ruff, Knip (Dead Code), Bandit (Security)    |
| CI/CD          | GitHub Actions, Dependabot, GitHub Pages (E2E Repos) |
| エラー監視     | Sentry（全アプリ共通）                               |
| 編集制御       | 悲観的ロック（30分有効期限 + ハートビート）          |
| バリデーション | 共通ルール（FE/BE で同一ルール適用）                 |
| API認証        | APIキー認証（本番環境用）                            |

## 主な機能

### Scout（現場アプリ）

| 機能             | 説明                                          |
| ---------------- | --------------------------------------------- |
| オフライン対応   | IndexedDB でローカル保存、オンライン時に同期  |
| 編集ロック       | 複数人の同時編集を防止（30分有効、5分毎延長） |
| 簡易ロールバック | 直前の保存状態に戻す（1世代のみ）             |
| 閲覧/編集モード  | 誤入力防止のためモードを選択して開く          |

### Admin（管理画面）

| 機能           | 説明                                       |
| -------------- | ------------------------------------------ |
| マスタ管理     | 会社、作業者、計器等のマスタデータ管理     |
| レポート出力   | PDF/Excel 生成、テンプレート管理           |
| 簡易設計台     | テンプレートのセル編集・プレースホルダ挿入 |
| データ同期     | Scout へのデータ配信（Direct Handoff）     |
| デモデータ管理 | テスト用データの投入・削除                 |

## 開発ルール

### Backend

```powershell
# venv を有効にして作業
.\venv\Scripts\activate

# コード変更後は必ずテスト実行（CI と同等の ruff は pnpm lint:backend で確認可能）
cd apps/backend
ruff format .
ruff check . --fix
python -m pytest --cov=services --cov=main --cov-report=term-missing
```

### Frontend

```powershell
# 型定義は共有パッケージから import
import { Company, Report } from "@citadel/types";

# Lint
pnpm lint

# React 19 / Compiler 対応
- `useEffect` 内での同期的 `setState` は避け、`useState` の初期値や `setTimeout` を活用してください。
- フォームの監視には `watch` ではなく `useWatch` を使用し、メモライゼーションを最適化してください。
```

### 型・スキーマのずれを防ぐ（API / 新マスタの追加時）

バックエンドのスキーマや API のリクエスト型、または新しいマスタテーブルを追加した場合は、以下の手順でシステム全体を自動同期させることができます。

1. **メタデータ定義**: `shared/schema-metadata.json` （および必要に応じて `shared/validation-rules.json`）を編集する
2. **自動生成実行**:
   - `pnpm generate:schema`（Dexie や TypeScript の静的定数を一括生成）
   - `pnpm generate:types`（Python OpenAPI から `packages/types` を更新）
   - `pnpm generate:validation`（FE / BE 向け文字数制限等を同期）
3. **バックエンドでの追記**: `models.py` および `schemas.py` の Pydantic ファクトリ (`create_input_schema`) に最低限の定義を追加し、マイグレーション (`pnpm db:migrate`) を実行する

> ℹ️ 上記のコマンド群により、従来の手作業だった Dexie DB バージョンの `db.ts` や TypeScript 側の `FOREIGN_KEYS` 手動登録、Python 側のスキーマ登録といったボイラープレートは完全に廃止・自動化されています。

## トラブルシューティング

### ポートが既に使用されている

```powershell
# 状態確認
pnpm status

# 強制停止
pnpm stop
```

### データベースに接続できない

```powershell
# Docker が起動しているか確認
docker ps

# DB を再起動
pnpm db:down
pnpm db:up
```

### 依存関係のエラー

```powershell
# Node.js 依存関係を再インストール
pnpm install

# Python 依存関係を再インストール（必ず仮想環境を有効化してから実行）
.\venv\Scripts\activate
pip install -r apps/backend/requirements.txt
pip install pytest pytest-asyncio pytest-cov pytest-xdist bandit httpx aiosqlite ruff
```

※ Backend 向けの各種スクリプト（`pnpm test:backend`, `pnpm db:migrate`, `pnpm generate:types` など）はプロジェクトの `venv` を参照します。venv が無い場合は上記で venv を作成・有効化してから `pip install` してください。

### Citadel から Scout を起動したあとデータが読み込めない

Admin（Citadel）で「Scout を起動して転送」したあと、Scout 側で「データの読み込みに失敗」となる場合、**バックエンドの CORS 設定**が原因であることが多いです。IP アドレスや他 PC で Scout を開いていると、ブラウザのオリジンがデフォルトの許可リストに含まれず、バックエンドへのリクエストがブロックされます。

- **対処**: バックエンドの `.env` で `ALLOWED_ORIGINS` に Scout / Admin の**実際のオリジン**（例: `http://192.168.1.100:3000`, `http://192.168.1.100:3001`）を追加し、バックエンドを再起動してください。
- **詳細**: [docs/HANDOFF_TROUBLESHOOTING.md](docs/HANDOFF_TROUBLESHOOTING.md)

## ドキュメント一覧

| ドキュメント                                                       | 説明                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [docs/PRODUCTION.md](docs/PRODUCTION.md)                           | 本番環境での起動方法とオフライン挙動                                |
| [docs/NETWORK_SETUP.md](docs/NETWORK_SETUP.md)                     | ネットワーク設定（HTTPS・オフライン機能）                           |
| [docs/HANDOFF_TROUBLESHOOTING.md](docs/HANDOFF_TROUBLESHOOTING.md) | Citadel → Scout データ読み込み失敗の原因と対処（CORS 等）           |
| [docs/PRINT_TROUBLESHOOTING.md](docs/PRINT_TROUBLESHOOTING.md)     | 印刷・PDF のトラブルシューティング                                  |
| [docs/TEST_REVIEW.md](docs/TEST_REVIEW.md)                         | テスト構成・正常系/異常系マーカー一覧                               |
| [docs/SHARED_CONFIG.md](docs/SHARED_CONFIG.md)                     | 共通設定パッケージ（TypeScript/ESLint/Tailwind/Prettier）の参照方法 |
| [docs/TECH_DEBT.md](docs/TECH_DEBT.md)                             | 技術的負債一覧（依存・無効化コメント・未使用コード方針）            |
| [apps/scout/README.md](apps/scout/README.md)                       | Scout（現場用 PWA）の機能・オフライン対応                           |
| [apps/admin/README.md](apps/admin/README.md)                       | Admin（管理画面）の機能                                             |

## 本番環境について

この審査用スナップショットには、本番用の機密設定や実データは含めていません。公開しているのは、構成理解と準実行の追跡に必要な **設定例** と **コード本体** のみです。

本番運用の考え方を確認したい場合は、次を参照してください。

- `.env.example`
- `docker-compose.yml`
- `docker-compose.override.yml.example`
- `docs/DEVELOPER.md`

公開版では、具体的な本番パスや実運用値は意図的に省いています。
