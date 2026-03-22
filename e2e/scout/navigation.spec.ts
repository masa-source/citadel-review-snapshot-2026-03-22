import { test, expect } from "@playwright/test";

test.describe("Scout アプリ - ナビゲーション", () => {
  test("ホームページが表示される", async ({ page }) => {
    await page.goto("/");

    // タイトルを確認
    await expect(page).toHaveTitle(/次世代現場報告システム/);

    // メインナビゲーションリンクを確認（「管理」はマスタ管理・データ管理の2つあるため .first() で十分）
    await expect(page.getByRole("link", { name: /レポート/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /管理/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /マスタ/i })).toBeVisible();
  });

  test("レポート一覧ページに遷移できる", async ({ page }) => {
    await page.goto("/");

    // レポートリンクをクリック
    await page.getByRole("link", { name: /レポート/i }).click();

    // URLを確認
    await expect(page).toHaveURL(/\/reports/);
  });

  test("管理ページに遷移できる", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "データ管理" }).click();

    await expect(page).toHaveURL(/\/manage/);
  });

  test("マスタページに遷移できる", async ({ page }) => {
    await page.goto("/");

    // マスタリンクをクリック
    await page.getByRole("link", { name: /マスタ/i }).click();

    // URLを確認
    await expect(page).toHaveURL(/\/masters/);
  });
});

test.describe("Scout アプリ - オフラインサポート", () => {
  test("オフラインページが存在する", async ({ page }) => {
    await page.goto("/offline");

    // オフラインページのコンテンツを確認
    await expect(page.getByText(/オフライン|接続|ネットワーク/i).first()).toBeVisible();
  });
});
