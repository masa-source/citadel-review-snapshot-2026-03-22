# Citadel Scout - 現場用 PWA アプリ

現場での検査報告書作成・管理を行うオフラインファースト PWA アプリケーションです。

## 技術スタック

| 技術           | 説明                           |
| -------------- | ------------------------------ |
| **Framework**  | Vite 6 + React 19 (TypeScript) |
| **Style**      | Tailwind CSS                   |
| **Icon**       | Lucide React                   |
| **Local DB**   | Dexie.js (IndexedDB)           |
| **PWA**        | vite-plugin-pwa                |
| **UI**         | shadcn/ui                      |
| **ID生成**     | UUID v4（クライアント側生成）  |
| **エラー監視** | Sentry                         |

## セットアップ

モノレポのルートディレクトリから実行してください。

```bash
# 依存関係インストール（ルートで実行）
pnpm install

# Scout のみ開発サーバー起動
pnpm dev:scout
```

または全サービス一括起動：

```bash
pnpm start
```

## アクセス

- **開発サーバー**: http://localhost:3000
- **オフラインページ**: http://localhost:3000/offline

## 主な機能

### レポート管理

| 機能             | 説明                                                |
| ---------------- | --------------------------------------------------- |
| レポート一覧     | `/reports` - 登録済みレポートの一覧表示             |
| レポート編集     | `/reports/edit?id=xxx` - レポートの作成・編集       |
| 編集ロック       | 複数人の同時編集を防止（30分有効、5分毎に自動延長） |
| 簡易ロールバック | 直前の保存状態に戻す（1世代のみ）                   |

### マスタ管理

| ページ   | パス                         |
| -------- | ---------------------------- |
| 会社     | `/masters/companies`         |
| 作業者   | `/masters/workers`           |
| 計器     | `/masters/instruments`       |
| 所有計器 | `/masters/owned-instruments` |
| 部品     | `/masters/parts`             |

### データ管理

- **データ管理画面**: `/manage`
- JSON インポート/エクスポート
- オフライン用データのダウンロード（キャッシュ準備）
- 差分同期：最終同期日時以降の更新データのみを効率的に取得

## オフライン対応

Scout はオフラインファースト設計です。

### 仕組み

1. **IndexedDB (Dexie.js)**: 全データをローカルに保存
2. **Service Worker**: ページをキャッシュしてオフラインでも表示可能（vite-plugin-pwa / Workbox）
3. **SPA**: Vite ビルドによる静的アセットとして配信

### オフライン利用の準備

1. オンライン時にアプリを開く
2. データ管理画面で「オフライン用データをダウンロード」を実行
3. 必要なページを一度開いておく（SW がキャッシュ）

### オフライン時の動作

- レポートの閲覧・編集・新規作成: ✅ 可能
- マスタデータの参照・編集: ✅ 可能
- JSON エクスポート: ✅ 可能
- 編集ロック取得: ❌ 不可（警告表示）
- サーバー同期: ❌ 不可（オンライン復帰後に実行）

### 外部依存（オフライン完全隔離）

Scout は **Google Fonts や外部 CDN に依存していません**。フォント・スタイル・スクリプトはすべてローカル（Tailwind / ビルド成果物 / `public/`）に含まれており、オフライン完全隔離環境でも期待通りに動作します。

## 編集ロック機能

複数ユーザーの同時編集による競合を防ぐため、悲観的ロックを実装しています。

### 動作フロー

1. 編集モードでレポートを開く → ロック取得（30分有効）
2. 編集中は5分毎にハートビートでロック延長
3. 閲覧モードに切り替え or ページ離脱 → ロック解除
4. 期限切れロックはサーバー側で自動解除

### 注意事項

- オフライン時はロックを取得できません（警告が表示されます）

### コーディング規約 (React 19 / Compiler 対応)

パフォーマンス最適化と React Compiler の恩恵を最大化するため、以下のルールを遵守してください。

- **useEffect 内の同期的 setState 回避**:
  - cascading render を防ぐため、可能な限り `useState` の初期値関数やイベントハンドラで完結させてください。
  - やむを得ない場合は `Promise.resolve().then()` や `setTimeout` で更新を遅延させてください。
- **React Hook Form の最適化**:
  - `watch` ではなく `useWatch` を使用してください。不要な再レンダリングを抑制し、Compiler との親和性が高まります。
- **未使用変数の削除**:
  - Lint エラーを防ぐため、未使用のインポートや変数は残さないでください。

## トラブルシューティング

### IndexedDB スキーマエラー

アプリのアップデート後にスキーマエラーが発生することがあります。

- **症状**: データが表示されない、エラーメッセージが表示される
- **原因**: IndexedDB のスキーマバージョンが古い、もしくは `shared/schema-metadata.json` からの `pnpm generate:schema` の反映漏れ
- **解決方法**:
  1. `pnpm generate:schema` が済んでいるか確認
  2. アプリ上で「データベースをリセット」ボタンを押してリセット後、サーバーからデータを再転送

**注意**: リセットするとローカルの全データが削除されます。

## テスト

```bash
# ルートから Scout の単体テスト実行
pnpm -F @citadel/scout exec vitest run

# watch モード（Scout ディレクトリで）
cd apps/scout && npx vitest

# E2E（ルートから）
pnpm test:e2e:scout
```

## ビルド

```bash
# Scout のみビルド
pnpm build:scout

# 出力先: apps/scout/dist/
```

## PWA について

- 本番ビルド時に Service Worker と Workbox が `dist/` に生成されます（vite-plugin-pwa）
- 開発時 (`pnpm dev:scout`) では PWA は Vite の dev サーバーで動作します
- `public/manifest.json` でアプリ名・表示モードなどを設定しています

### 自動更新通知

アプリの新しいバージョンが利用可能になると、画面下部にバナーが表示されます。

- **「今すぐ更新」**: アプリを即座にリロードして最新版を適用
- **「後で」**: バナーを閉じる（次回アクセス時に再表示）
- 1時間ごとに自動で更新をチェック

### 関連ファイル

- `src/hooks/useServiceWorker.ts` - Service Worker 管理フック
- `src/components/UpdateNotification.tsx` - 更新通知バナー

## ディレクトリ構成

```
apps/scout/
├── src/
│   ├── routes/        # ページ（React Router）
│   │   ├── manage/    # データ管理
│   │   ├── masters/   # マスタ管理
│   │   ├── reports/   # レポート管理
│   │   └── offline/   # オフラインフォールバック
│   ├── components/    # UI コンポーネント
│   ├── db/            # Dexie (IndexedDB) 定義
│   ├── hooks/         # カスタムフック
│   ├── types/         # 型定義
│   └── utils/         # ユーティリティ
├── public/            # 静的ファイル・PWA アセット
├── index.html         # エントリ HTML（Vite）
└── vite.config.ts     # Vite + PWA 設定
```

## 関連ドキュメント

- [プロジェクト全体 README](../../README.md)
- [docs/HANDOFF_TROUBLESHOOTING.md](../../docs/HANDOFF_TROUBLESHOOTING.md) - データ受信失敗時（CORS・ALLOWED_ORIGINS）
- [docs/NETWORK_SETUP.md](../../docs/NETWORK_SETUP.md) - ネットワーク設定（HTTPS・オフライン）
