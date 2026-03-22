import { test, expect } from "@playwright/test";

/**
 * カスタムデータ（スキーマ駆動 RJSF フォーム）の入力が反映されることを検証する。
 * - スキーマを選択するとフォームが表示される
 * - テキスト入力に打った文字がそのまま表示される（数字フィールドでも同様）
 *
 * スキーマが IndexedDB にない場合（Backend の demo データ未投入 or Scout 未同期）は
 * 入力反映のテストはスキップされる。Backend 起動・demo データ投入・Scout 同期後に再実行すること。
 */
test.describe("Scout - カスタムデータフォーム入力", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("load");
    await expect(page.getByRole("link", { name: /新規作成/ }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("編集ページを開くとカスタムデータ用のスキーマ選択が表示される", async ({ page }) => {
    await page.goto("/reports/edit");
    await expect(page).toHaveURL(/\/reports\/edit/);
    await expect(page.getByRole("heading", { name: /レポート新規作成|レポート編集/ })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("#schema-custom-data-schema-id")).toBeVisible({
      timeout: 5000,
    });
  });

  test("スキーマ選択後・カスタムデータの文字列入力が反映される", async ({ page }) => {
    // 権限で「新規作成」が無効になる場合があるため、編集ページへ直接遷移する
    await page.goto("/reports/edit");
    await expect(page).toHaveURL(/\/reports\/edit/);
    await expect(page.getByRole("heading", { name: /レポート新規作成|レポート編集/ })).toBeVisible({
      timeout: 10000,
    });

    // 報告書用フォーマット（スキーマ）の select
    const schemaSelect = page.locator("#schema-custom-data-schema-id");
    await expect(schemaSelect).toBeVisible({ timeout: 5000 });

    // スキーマが1件以上ある場合のみ実行（— 選択 — 以外の option）
    const options = await schemaSelect.locator("option").allTextContents();
    const selectableOptions = options.filter((t) => t.trim() && !t.includes("— 選択 —"));
    if (selectableOptions.length === 0) {
      test.skip(
        true,
        "スキーマが1件もないため（Backend の demo データ投入と Scout 同期後に再実行）"
      );
      return;
    }

    // 最初のスキーマを選択
    await schemaSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    // スキーマによりラベルは異なる。メモ・備考・実施概要などの textbox を探す
    const textInput = page.getByRole("textbox").first();
    await expect(textInput).toBeVisible({ timeout: 5000 });

    const typed = "E2Eカスタムデータ";
    await textInput.click();
    await textInput.pressSequentially(typed, { delay: 30 });
    await page.waitForTimeout(300);

    // 入力が反映されていること（value または表示テキスト）
    await expect(textInput).toHaveValue(typed);
  });

  test("既存レポート編集時・カスタムデータの入力が反映される", async ({ page }) => {
    // 一覧にレポートがある場合、最初の「編集」を開く
    const editBtn = page.getByRole("button", { name: "編集" }).first();
    const hasReport = await editBtn.isVisible().catch(() => false);
    if (!hasReport) {
      test.skip(true, "一覧にレポートが1件もないため");
      return;
    }

    await editBtn.click();
    await expect(page).toHaveURL(/\/reports\/edit\/.*/);

    // カスタムデータの入力欄（スキーマが紐づいていれば表示される）
    const schemaSelect = page.locator("#schema-custom-data-schema-id");
    const schemaVisible = await schemaSelect.isVisible().catch(() => false);
    if (!schemaVisible) {
      test.skip(true, "編集ページにスキーマ選択が表示されていないため");
      return;
    }

    const options = await schemaSelect.locator("option").allTextContents();
    const selectableOptions = options.filter((t) => t.trim() && !t.includes("— 選択 —"));
    if (selectableOptions.length === 0) {
      test.skip(
        true,
        "スキーマが1件もないため（Backend の demo データ投入と Scout 同期後に再実行）"
      );
      return;
    }

    // すでにスキーマが選択されているか、選択する
    const value = await schemaSelect.inputValue();
    if (!value) {
      await schemaSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    const textInput = page.getByRole("textbox").first();
    await expect(textInput).toBeVisible({ timeout: 5000 });

    const suffix = ` ${Date.now()}`;
    await textInput.click();
    await textInput.pressSequentially(suffix, { delay: 30 });
    await page.waitForTimeout(300);

    // 既存値 + suffix が含まれること（完全一致でなく「含まれる」で検証）
    const currentValue = await textInput.inputValue();
    expect(currentValue).toContain(suffix.trim());
  });
});
