import { test, expect } from "@playwright/test";

test.describe("Scout アプリ - レポート編集フロー", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("load");
    await expect(page.getByRole("link", { name: /新規作成/ }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("新規作成: レポート一覧から「新規作成」ボタンを押すとフォームが表示される", async ({
    page,
  }) => {
    await expect(page.getByRole("link", { name: "新規作成" }).first()).toBeVisible();

    await page.getByRole("link", { name: "新規作成" }).first().click();

    await expect(page).toHaveURL(/\/reports\/edit/);
    await expect(
      page.getByRole("heading", { name: /レポート新規作成|レポート編集/ })
    ).toBeVisible();
    await expect(page.getByLabel("タイトル")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "管理番号", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
  });

  test("入力と保存: 基本情報を入力して保存すると成功すること", async ({ page }) => {
    await page
      .getByRole("link", { name: /新規作成/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/reports\/edit/);

    const title = `E2Eテスト ${Date.now()}`;
    const controlNumber = `CTL-E2E-${Date.now()}`;

    // React Hook Form が値を認識するよう、キー入力で入力（fill だけでは RHF の state が更新されない）
    await page.getByLabel("タイトル").click();
    await page.getByLabel("タイトル").pressSequentially(title, { delay: 20 });
    await page.getByRole("textbox", { name: "管理番号", exact: true }).click();
    await page
      .getByRole("textbox", { name: "管理番号", exact: true })
      .pressSequentially(controlNumber, { delay: 20 });
    await page.waitForTimeout(300);

    await page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/reports\/edit\?.*id=/, { timeout: 10000 });
  });

  test("データ永続化: 一覧に戻り作成したレポートが存在し、開くと値が維持されている", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: /新規作成/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/reports\/edit/);

    const title = `永続化テスト ${Date.now()}`;
    const controlNumber = `CTL-PERSIST-${Date.now()}`;

    await page.getByLabel("タイトル").click();
    await page.getByLabel("タイトル").pressSequentially(title, { delay: 20 });
    await page.getByRole("textbox", { name: "管理番号", exact: true }).click();
    await page
      .getByRole("textbox", { name: "管理番号", exact: true })
      .pressSequentially(controlNumber, { delay: 20 });
    await page.waitForTimeout(300);

    await page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/reports\/edit\?.*id=/, { timeout: 10000 });

    await page.getByRole("link", { name: /キャンセル/ }).click();
    await expect(page).toHaveURL(/\/reports/);

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(controlNumber)).toBeVisible();

    await page
      .locator("li")
      .filter({ hasText: title })
      .getByRole("button", { name: "編集" })
      .click();
    await expect(page).toHaveURL(/\/reports\/edit(\?.*id=|$)/);
    await expect(page.getByLabel("タイトル")).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "管理番号", exact: true })).toHaveValue(
      controlNumber
    );
  });

  test("バリデーション: 必須項目（タイトル）が空で保存するとエラーが表示される", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: /新規作成/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/reports\/edit/);

    await page.getByLabel("タイトル").clear();
    await page.getByLabel("タイトル").evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page.getByText("必須項目です", { timeout: 10000 })).toBeVisible();
    await expect(page).toHaveURL(/\/reports\/edit$/);
    expect(page.url()).not.toContain("id=");
  });
});
