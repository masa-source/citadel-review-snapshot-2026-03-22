import { test, expect } from "@playwright/test";

test.describe("Scout アプリ - マスタ管理", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/masters");
    await expect(page.getByRole("link", { name: /会社マスタ/ }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("マスタ一覧ページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("各マスタへのリンクが表示される", async ({ page }) => {
    await expect(page.getByRole("link", { name: /会社マスタ/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /作業者マスタ/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /計器マスタ/ }).first()).toBeVisible();
  });

  test("会社マスタページに遷移できる", async ({ page }) => {
    await page.getByRole("link", { name: "会社マスタ 会社・組織の登録・編集" }).click();
    await expect(page).toHaveURL(/\/masters\/companies/);
  });

  test("作業者マスタページに遷移できる", async ({ page }) => {
    await page
      .getByRole("link", { name: /作業者マスタ/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/masters\/workers/);
  });
});

test.describe("Scout アプリ - 会社マスタ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/masters/companies");
    await expect(page.getByRole("heading", { name: "会社マスタ" })).toBeVisible({ timeout: 15000 });
  });

  test("会社マスタページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "会社マスタ" })).toBeVisible();
  });

  test("新規追加ボタンが表示される", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /追加|新規/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Scout アプリ - 作業者マスタ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/masters/workers");
    await expect(page.getByRole("heading", { name: "作業者マスタ" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("作業者マスタページが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "作業者マスタ" })).toBeVisible();
  });

  test("新規追加ボタンが表示される", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /追加|新規/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
  });
});
