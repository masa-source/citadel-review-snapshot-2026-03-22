# 共通設定パッケージ

フロントエンドの Prettier / TypeScript / ESLint / Tailwind の設定をモノレポ内で一元化し、各アプリ・パッケージから参照する構成です。

## 概要

| 種類           | 場所                         | 参照方法                                                                                    |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| **Prettier**   | ルート `.prettierrc`         | ルートのみ。各アプリはルート設定を継承（サブディレクトリでは上位の .prettierrc が使われる） |
| **TypeScript** | `packages/typescript-config` | 各 `tsconfig.json` で `"extends": "@citadel/typescript-config/xxx.json"`                    |
| **ESLint**     | `packages/eslint-config`     | 各 `.eslintrc.json` で `"extends": ["@citadel/eslint-config/xxx.js"]`                       |
| **Tailwind**   | `packages/tailwind-config`   | 各 `tailwind.config` の `presets: [require("@citadel/tailwind-config")]`                    |

## Prettier

- **設定ファイル**: ルート [`.prettierrc`](../.prettierrc)
- アプリ別の `.prettierrc` は持たず、ルートの設定が全体に適用されます。
- 改行コードは `endOfLine: "lf"` に固定されています。Windows 環境でも Dagger/GHA との整合性を保つため、[`.gitattributes`](../.gitattributes) により LF が強制されます。
- `.prettierignore` はルート（および必要なら各アプリ）に配置します。

## TypeScript（@citadel/typescript-config）

- **パッケージ**: [packages/typescript-config](../packages/typescript-config)
- **利用可能なプリセット**:
  - `base.json` — 共通コンパイラオプション（**Vite アプリの Scout / Admin はこれを継承**）
  - `library.json` — ライブラリ用（types, ui 等）
  - `react-library.json` — React を含むライブラリ用（ui）
  - ※ 旧 Next.js 向けの `next.json` は Vite への完全移行に伴い削除済みです。
- **参照例**（Vite アプリ: Scout / Admin）:
  ```json
  {
    "extends": "@citadel/typescript-config/base.json",
    "compilerOptions": {
      "baseUrl": ".",
      "paths": { "@/*": ["./src/*"] },
      "lib": ["dom", "dom.iterable", "ESNext"],
      "jsx": "react-jsx"
    },
    "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"],
    "exclude": ["node_modules"]
  }
  ```
- **参照例**（ライブラリ）:
  ```json
  {
    "extends": "@citadel/typescript-config/library.json",
    "compilerOptions": { "outDir": "dist" },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
  }
  ```
- `include` / `exclude` は各パッケージのルート基準で必要に応じてローカルに定義します。

## ESLint（@citadel/eslint-config）

- **パッケージ**: [packages/eslint-config](../packages/eslint-config)
- **利用可能なプリセット**:
  - `base.js` — 共通ルール（TypeScript 等）
  - `vite-react.js` — Vite + React アプリ用のルール（Scout/Admin 向け）
  - `vite-react-import.js` — `vite-react.js` + eslint-plugin-import の import 解決（Admin 等）
  - `library.js` — ライブラリ用（types 等）
  - ※ 旧 Next.js 向けの `next.js` / `next-import.js` は Vite への完全移行に伴い削除済みです。
- **参照例**（React/Vite アプリ）:
  ```json
  {
    "extends": ["@citadel/eslint-config/vite-react.js"],
    "ignorePatterns": ["!.cursor", "node_modules"]
  }
  ```
- Admin で import 解決を使う場合:
  ```json
  {
    "extends": ["@citadel/eslint-config/vite-react-import.js"],
    "settings": {
      "import/resolver": { "typescript": { "project": "./tsconfig.json" } }
    }
  }
  ```

## Tailwind（@citadel/tailwind-config）

- **パッケージ**: [packages/tailwind-config](../packages/tailwind-config)
- 共通の `theme`（色・角丸・アニメーション等）と `tailwindcss-animate` をエクスポートしています。
- **参照例**（Vite/React アプリ）:

  ```js
  // tailwind.config.ts または .js
  import type { Config } from "tailwindcss";
  import shared from "@citadel/tailwind-config";

  const config: Config = {
    presets: [shared],
    content: [
      "./src/**/*.{js,ts,jsx,tsx,mdx}",
      "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
  };
  export default config;
  ```

- アプリ固有の `content` や `darkMode` は各アプリの設定に記載します。共通の CSS 変数（例: `--primary`, `--background`）は `globals.css` の `:root` で定義してください。

## 依存関係の追加

新規アプリやパッケージで上記パッケージを使う場合:

```bash
pnpm add -D @citadel/typescript-config   # tsconfig を extends する場合
pnpm add -D @citadel/eslint-config      # ESLint を extends する場合
pnpm add -D @citadel/tailwind-config    # Tailwind preset を使う場合（Scout/Admin 等）
```

workspace 内のため、`pnpm install` でルートから一括解決されます。

## 動作確認

共通設定変更後は以下で確認してください。

```bash
pnpm install
pnpm run build
pnpm run lint
```
