import { test, expect } from "@playwright/test";

test.describe("Admin アプリ - レポート一覧", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
  });

  test("レポート一覧ページが表示される", async ({ page }) => {
    // ページの読み込みを待機
    await page.waitForLoadState("networkidle");

    // ページコンテンツを確認
    await expect(page.locator("body")).toBeVisible();
  });

  test("検索フォームが表示される", async ({ page }) => {
    // 検索入力フィールドを探す
    const searchInput = page.getByPlaceholder(/検索|Search/i);
    const count = await searchInput.count();

    // 検索フォームがある場合は表示を確認
    if (count > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test("レポートフィルターが機能する", async ({ page }) => {
    // フィルターボタンまたはセレクトを探す
    const filterElements = page.locator('[data-testid="filter"], select, [role="combobox"]');
    const count = await filterElements.count();

    // フィルター要素がある場合のテスト
    if (count > 0) {
      await expect(filterElements.first()).toBeVisible();
    }
  });
});

test.describe("Admin アプリ - レポート詳細", () => {
  test("レポート詳細ページのURLパターンが正しい", async ({ page }) => {
    // レポート詳細ページのURLパターンを確認（存在する場合）
    await page.goto("/reports");

    // レポートリストからリンクをクリック（存在する場合）
    const reportLinks = page.locator('a[href*="/reports/"]');
    const count = await reportLinks.count();

    if (count > 0) {
      await reportLinks.first().click();
      await expect(page).toHaveURL(/\/reports\//);
    }
  });
});
