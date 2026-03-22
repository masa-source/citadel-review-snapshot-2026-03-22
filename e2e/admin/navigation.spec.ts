import { test, expect } from "@playwright/test";

test.describe("Admin アプリ - ナビゲーション", () => {
  test("ホームページが表示される", async ({ page }) => {
    await page.goto("/");

    // タイトルを確認
    await expect(page).toHaveTitle(/管理|Admin/i);
  });

  test("メインナビゲーションが表示される", async ({ page }) => {
    await page.goto("/");

    // ナビゲーションリンクを確認
    await expect(page.getByRole("navigation")).toBeVisible();
  });
});

test.describe("Admin アプリ - レポート管理", () => {
  test("レポート一覧ページに遷移できる", async ({ page }) => {
    await page.goto("/");

    // レポートリンクをクリック
    const reportsLink = page.getByRole("link", { name: /レポート/i });
    if ((await reportsLink.count()) > 0) {
      await reportsLink.first().click();
      await expect(page).toHaveURL(/\/reports/);
    }
  });
});

test.describe("Admin アプリ - テンプレート管理", () => {
  test("テンプレートページに遷移できる", async ({ page }) => {
    await page.goto("/");

    // テンプレートリンクをクリック
    const templatesLink = page.getByRole("link", { name: /テンプレート/i });
    if ((await templatesLink.count()) > 0) {
      await templatesLink.first().click();
      await expect(page).toHaveURL(/\/templates/);
    }
  });
});
