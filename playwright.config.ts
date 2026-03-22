import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E テスト設定
 *
 * 実行方法:
 * - すべてのテスト: pnpm test:e2e
 * - Scout のみ: pnpm test:e2e:scout または pnpm test:e2e --project=scout
 * - Admin のみ: pnpm test:e2e:admin または pnpm test:e2e --project=admin
 * - UI モード: pnpm test:e2e:ui
 * - デバッグ: pnpm test:e2e --debug
 *
 * 前提: 別ターミナルで `pnpm start` を実行し、Backend(8000) / Scout(3000) / Admin(3001) を
 * 起動した状態で E2E を実行すること。globalSetup は起動確認のみ行い、サービスは起動しない。
 */
export default defineConfig({
  testDir: "./e2e",
  /* E2E 前に Backend/Scout/Admin の起動を確認するのみ（pnpm start 済みである必要あり） */
  globalSetup: "./e2e/globalSetup.ts",
  /* テストの並列実行 */
  fullyParallel: true,
  /* CI では失敗したテストの再試行を行わない */
  forbidOnly: !!process.env.CI,
  /* CI ではリトライを2回行う */
  retries: process.env.CI ? 2 : 0,
  /* CI では並列ワーカー数を制限 */
  workers: process.env.CI ? 1 : undefined,
  /* レポーター設定 */
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  /* アサーションの最大待機（トップレベルに移動） */
  expect: { timeout: 10 * 1000 },
  /* 全テスト共通の設定 */
  timeout: 45 * 1000 /* 初回ロード・API 待ちで 30s を超えることがあるため */,
  use: {
    /* ベース URL（テスト時に相対パスが使用可能） */
    baseURL: "http://localhost:3000",
    /* 1アクション（click, fill 等）の最大待機。固まり防止で 15s で打ち切り */
    actionTimeout: 15 * 1000,
    /* 失敗時のスクリーンショット */
    screenshot: "only-on-failure",
    /* 失敗時のトレース */
    trace: "on-first-retry",
    /* ビューポートサイズ */
    viewport: { width: 1280, height: 720 },
  },

  /* プロジェクト設定 */
  projects: [
    {
      name: "scout",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3000",
      },
      testDir: "./e2e/scout",
    },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3001",
      },
      testDir: "./e2e/admin",
    },
    /* モバイルテスト（Scout PWA用） */
    {
      name: "scout-mobile",
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://localhost:3000",
      },
      testDir: "./e2e/scout",
    },
  ],

  webServer: [
    {
      command: process.env.CI ? "" : "pnpm --filter @citadel/scout run dev",
      url: "http://localhost:3000",
      cwd: process.cwd(),
      reuseExistingServer: true,
      timeout: 120 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: process.env.CI ? "" : "pnpm --filter @citadel/admin run dev",
      url: "http://localhost:3001",
      cwd: process.cwd(),
      reuseExistingServer: true,
      timeout: 120 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
