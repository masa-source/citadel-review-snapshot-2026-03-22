import { test, expect } from "@playwright/test";

/**
 * packages/types/src/validation.ts のルールが UI 上で適用されていることを検証する。
 * 必須項目・最大文字数等でエラー表示され、保存処理が走らないことを確認する。
 */
test.describe("Scout - バリデーション適用", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("load");
    await expect(page.getByRole("link", { name: /新規作成/ }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("必須項目（タイトル）が空で保存するとエラーが表示され保存されない", async ({ page }) => {
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
    // URL に id が付かず編集画面のまま（保存完了していない）
    await expect(page).toHaveURL(/\/reports\/edit$/);
    expect(page.url()).not.toContain("id=");
  });

  test("タイトルが最大文字数（200文字）を超えるとエラーが表示され保存されない", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: /新規作成/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/reports\/edit/);

    // 報告書種別を選択（ドロップダウン対応）
    const reportTypeSelect = page.getByLabel("報告書種別");

    // #region agent log
    await page.evaluate(() => {
      const select = document.getElementById("reportType") as HTMLSelectElement | null;
      const optionLabels = Array.from(select?.options ?? []).map((o) => o.textContent ?? "");
      fetch("http://127.0.0.1:7242/ingest/7ff65595-a1de-449d-9c7a-c525f66d75b9", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "290381",
        },
        body: JSON.stringify({
          sessionId: "290381",
          location: "e2e/scout/validation.spec.ts:46",
          message: "reportType options before selectOption",
          data: { optionLabels },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    });
    // #endregion agent log

    // ラベル名に依存せず、利用可能な最初の選択肢を選ぶ
    await reportTypeSelect.selectOption({ index: 0 });

    // REPORT_VALIDATION.reportTitle.maxLength = 200 → 201文字でエラー
    // maxLength 属性があると fill で 201 文字入れられないため一時的に外してから fill
    await page.evaluate(() => {
      const el = document.getElementById("reportTitle");
      if (el) el.removeAttribute("maxLength");
    });
    const overMax = "あ".repeat(201);
    await page.getByLabel("タイトル").fill(overMax);
    await page.getByLabel("タイトル").evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page.getByText(/200文字以内で入力してください/, { timeout: 10000 })).toBeVisible();
    await expect(page).toHaveURL(/\/reports\/edit$/);
    expect(page.url()).not.toContain("id=");
  });
});
