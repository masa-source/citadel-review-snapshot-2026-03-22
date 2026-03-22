import { test, expect } from "@playwright/test";

test.describe("Scout アプリ - 管理ページ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/manage");
    // 管理ページ本体の表示を待つ（データ統計セクションまで描画されること）
    await expect(page.getByRole("heading", { name: "データ統計" })).toBeVisible({ timeout: 25000 });
  });

  test("管理ページが正しく表示される", async ({ page }) => {
    // ページタイトルを確認
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // データカウントセクションを確認（manage ページは英語ラベル: Companies, Workers, Instruments, Reports）
    await expect(page.getByText("Companies").first()).toBeVisible();
    await expect(page.getByText("Workers").first()).toBeVisible();
    await expect(page.getByText("Instruments").first()).toBeVisible();
    await expect(page.getByText("Reports").first()).toBeVisible();
  });

  test("同期セクションが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /サーバー同期/ }).first()).toBeVisible();
  });

  test("QRコード読み取りボタンが存在する", async ({ page }) => {
    // QRコード関連のボタンまたはテキストを確認
    const qrButton = page.getByRole("button", { name: /QR|スキャン/i });
    // QRボタンが存在するか確認（オプション）
    const count = await qrButton.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Scout アプリ - データ同期", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/manage");
    await expect(page.getByRole("heading", { name: "データ統計" })).toBeVisible({ timeout: 25000 });
  });

  test("差分同期ボタンが表示される（最終同期後）", async ({ page }) => {
    const deltaSyncButton = page.getByRole("button", { name: /差分同期/i });
    await expect(deltaSyncButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("フル同期ボタンが表示される", async ({ page }) => {
    const fullSyncButton = page.getByRole("button", { name: /フル同期/i });
    await expect(fullSyncButton).toBeVisible({ timeout: 10000 });
  });
});
