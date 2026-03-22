import { test, expect } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

test.describe("Scout - データ同期（アップロード）", () => {
  test("レポートを作成し、サーバーへのアップロードが成功すること", async ({ page, request }) => {
    const uniqueId = Date.now();
    const reportTitle = `E2E Sync Test ${uniqueId}`;
    const controlNumber = `SYNC-${uniqueId}`;
    let createdReportId: string | null = null;

    try {
      // 1. レポート作成（/reports → 新規作成 → 入力 → 保存）
      await page.goto("/reports");
      await page.waitForLoadState("load");
      await expect(page.getByRole("link", { name: /新規作成/ }).first()).toBeVisible({
        timeout: 15000,
      });

      await page
        .getByRole("link", { name: /新規作成/ })
        .first()
        .click();
      await expect(page).toHaveURL(/\/reports\/edit/);

      await page.getByLabel("タイトル").click();
      await page.getByLabel("タイトル").pressSequentially(reportTitle, {
        delay: 20,
      });
      await page.getByRole("textbox", { name: "管理番号", exact: true }).click();
      await page
        .getByRole("textbox", { name: "管理番号", exact: true })
        .pressSequentially(controlNumber, { delay: 20 });
      await page.waitForTimeout(300);

      await page.getByRole("button", { name: "保存" }).click();
      await expect(page).toHaveURL(/\/reports\/edit\?.*id=/, {
        timeout: 10000,
      });

      // 2. アップロード（/manage → サーバーへ送信 → 送信完了表示）
      await page.goto("/manage");
      await expect(page.getByRole("heading", { name: "データ統計" })).toBeVisible({
        timeout: 25000,
      });

      await page.getByRole("button", { name: "サーバーへ送信" }).click();
      // 新規レポートはサーバーにないため「削除済み」ダイアログが出る → 「送信して再登録する」をクリック（出ない場合はスキップ）
      const reRegister = page.getByRole("button", {
        name: "送信して再登録する",
      });
      await reRegister.click({ timeout: 10000 }).catch(() => {});
      // 送信後に「レポートデータの削除」確認ダイアログが表示される場合は「残す」をクリック
      await page
        .getByRole("button", { name: "残す" })
        .click({ timeout: 5000 })
        .catch(() => {});
      // 成功メッセージは2種: 「送信が完了し、レポート…」（削除した場合）／「送信が完了しました。データは…」（残した場合）
      await expect(page.getByText(/送信が完了し(ました|、)/)).toBeVisible({ timeout: 15000 });

      // 3. API で GET /api/reports → タイトルで該当レポートを検索し id を保持
      const listRes = await request.get(`${API_URL}/api/reports`);
      expect(listRes.ok()).toBe(true);
      const reports = (await listRes.json()) as {
        id: string;
        reportTitle?: string;
        controlNumber?: string;
      }[];
      const found = reports.find(
        (r) => r.reportTitle === reportTitle || r.controlNumber === controlNumber
      );
      expect(found).toBeDefined();
      createdReportId = found!.id;
    } finally {
      // 4. クリーンアップ: DELETE /api/reports/{id}
      if (createdReportId) {
        await request.delete(`${API_URL}/api/reports/${createdReportId}`);
      }
    }
  });
});
