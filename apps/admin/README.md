# Citadel Admin - 管理画面アプリ

事務所向けの管理画面アプリケーションです。マスタデータの管理、レポートの出力（PDF/Excel）などを行います。

## 技術スタック

| 技術                 | 説明                                           |
| -------------------- | ---------------------------------------------- |
| **Framework**        | Vite 6 + React 19 (TypeScript)                 |
| **Style**            | Tailwind CSS                                   |
| **Data Fetching**    | SWR                                            |
| **HTTP Client**      | openapi-fetch                                  |
| **Icon**             | Lucide React                                   |
| **Testing**          | Vitest + React Testing Library                 |
| **エラー監視**       | Sentry                                         |
| **テンプレート編集** | 独自のツリービューコンポーネント（簡易設計台） |

## セットアップ

モノレポのルートディレクトリから実行してください。

```bash
# 依存関係インストール（ルートで実行）
pnpm install

# Admin のみ開発サーバー起動
pnpm dev:admin
```

または全サービス一括起動：

```bash
pnpm start
```

## アクセス

- **開発サーバー**: http://localhost:3001
- **バックエンド API**: http://localhost:8000
- **API ドキュメント**: http://localhost:8000/docs

## 前提条件

Admin アプリはバックエンド API に依存しています。  
`pnpm start` で全サービスを起動するか、以下を個別に起動してください：

```bash
# PostgreSQL 起動
pnpm db:up

# バックエンド起動（別ターミナル）
pnpm zx ./scripts/start-backend.mjs
```

## 主な機能

### ダッシュボード

- **トップページ**: `/` - レポート一覧の表示

### マスタ管理

| ページ     | パス                         |
| ---------- | ---------------------------- |
| マスタ一覧 | `/masters`                   |
| 会社       | `/masters/companies`         |
| 作業者     | `/masters/workers`           |
| 計器       | `/masters/instruments`       |
| 所有計器   | `/masters/owned-instruments` |
| 部品       | `/masters/parts`             |

### レポート出力

| ページ       | パス         | 説明                 |
| ------------ | ------------ | -------------------- |
| エクスポート | `/export`    | PDF/Excel 出力       |
| テンプレート | `/templates` | 出力テンプレート管理（アップロード・AIにおまかせ生成（Beta）・設計台） |

### 簡易設計台（テンプレート編集）

| ページ | パス                      | 説明                                       |
| ------ | ------------------------- | ------------------------------------------ |
| 設計台 | `/templates/drafting/:id` | テンプレートのセル編集・プレースホルダ挿入 |

- テンプレート一覧から「設計台を開く」で開く
- 独自のツリービューコンポーネントでセル値を編集し、PlaceholderList から `{{ path }}` を挿入可能
- 罫線・背景色・フォントは維持したまま値のみ保存
- **プレースホルダの推奨（キー参照）**: [docs/PRINT_TROUBLESHOOTING.md](../../docs/PRINT_TROUBLESHOOTING.md) を参照

### デモデータ管理

| ページ     | パス         | 説明                   |
| ---------- | ------------ | ---------------------- |
| デモデータ | `/demo-data` | デモデータの投入・削除 |

デモデータは `[DEMO]` プレフィックスで識別され、本番データとは分離されています。

### API 連携

| エンドポイント             | メソッド | 説明                                 |
| -------------------------- | -------- | ------------------------------------ |
| `/api/reports`             | GET      | レポート一覧取得                     |
| `/api/reports/{id}`        | GET      | レポート詳細取得                     |
| `/api/generate-report`     | POST     | PDF 生成                             |
| `/api/generate-excel`      | POST     | Excel ZIP 生成                       |
| `/api/templates/{id}/grid` | GET      | テンプレートグリッド取得（設計台用） |
| `/api/templates/{id}/grid` | POST     | テンプレートグリッド保存（設計台用） |
| `/api/templates/auto-generate` | POST | AI によるテンプレート自動生成（.xlsx + 表示名） |
| `/api/sync/full`           | POST     | Scout へのデータ同期                 |
| `/api/demo/seed`           | POST     | デモデータ投入                       |
| `/api/demo/clear`          | DELETE   | デモデータ削除                       |
| `/api/demo/status`         | GET      | デモデータ状態確認                   |

## テスト

```bash
# ルートから Admin の単体テスト実行
pnpm -F @citadel/admin exec vitest run

# watch モード（Admin ディレクトリで）
cd apps/admin && npx vitest

# E2E（ルートから）
pnpm test:e2e:admin
```

## ビルド

```bash
# Admin のみビルド
pnpm build:admin
```

## ディレクトリ構成

```
apps/admin/
├── src/
│   ├── routes/        # ページ（React Router）
│   │   ├── demo-data/ # デモデータ管理
│   │   ├── export/    # エクスポート機能
│   │   ├── masters/   # マスタ管理
│   │   ├── templates/ # テンプレート管理
│   │   │   └── drafting/:id/ # 簡易設計台
│   │   └── tools/     # 各種ツール
│   ├── components/    # UI コンポーネント
│   ├── lib/           # ユーティリティ
│   ├── types/         # 型定義
│   └── utils/         # API クライアント等
├── public/            # 静的ファイル
├── index.html         # エントリ HTML（Vite）
└── vite.config.ts     # Vite 設定
```

## 関連ドキュメント

- [プロジェクト全体 README](../../README.md)
- [docs/PRODUCTION.md](../../docs/PRODUCTION.md) - 本番環境での起動方法
- [docs/HANDOFF_TROUBLESHOOTING.md](../../docs/HANDOFF_TROUBLESHOOTING.md) - Citadel → Scout データ転送で失敗する場合（CORS・ALLOWED_ORIGINS）
- [docs/NETWORK_SETUP.md](../../docs/NETWORK_SETUP.md) - ネットワーク接続環境（HTTPS・オフライン機能）の設定ガイド
