
import { test, expect } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

test.describe("Scout - オフライン同期フロー（Handoff → オフライン編集 → Upload → Download）", () => {
  test("Handoff 受信 → オフラインでレポート編集 → オンライン復帰 → 送信・差分同期が成功すること", async ({
    page,
    request,
  }) => {
    // 1. Handoff 用 ticketId の発行
    const sampleData = {
      companies: [],
      workers: [],
      instruments: [],
      parts: [],
      ownedInstruments: [],
      reports: [],
    };
    const uploadRes = await request.post(`${API_URL}/api/sync/upload`, {
      data: sampleData,
    });
    expect(uploadRes.ok()).toBe(true);

    const handoffRes = await request.post(`${API_URL}/api/sync/handoff`, {
      data: {
        includeCompanies: true,
        includeWorkers: true,
        includeInstruments: true,
        includeParts: true,
        includeOwnedInstruments: true,
        includeInstrumentProperties: true,
        targetReportIds: [],
        exportMode: "edit",
        permission: "Collect",
      },
    });
    expect(handoffRes.ok()).toBe(true);
    const handoffJson = (await handoffRes.json()) as { ok: boolean; ticketId: string };
    expect(handoffJson.ok).toBe(true);
    const ticketId = handoffJson.ticketId;

    // 2. Scout 管理画面で Handoff 受信
    await page.goto(`/manage?ticket=${ticketId}`);
    await expect(page.getByRole("heading", { name: "データ統計" })).toBeVisible({ timeout: 20000 });

    // 3. レポート一覧を開き、新規作成で編集画面までオンラインのうちに遷移する
    //    （オフライン中はルート取得で chrome-error になるため、編集画面はオンラインで開く）
    await page.goto("/reports");
    await page.waitForLoadState("load");
    await expect(page.getByRole("link", { name: /新規作成/ }).first()).toBeVisible({
      timeout: 15000,
    });

    const uniqueId = Date.now();
    const reportTitle = `E2E Offline Sync ${uniqueId}`;
    const controlNumber = `OFFLINE-${uniqueId}`;

    await page
      .getByRole("link", { name: /新規作成/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/reports\/edit/);

    // 4. 編集画面表示済みの状態でオフライン化し、入力・保存は IndexedDB にのみ行う
    await page.context().setOffline(true);

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

    // 5. オンライン復帰
    await page.context().setOffline(false);

    // 6. Upload の実行と成功確認
    await page.goto("/manage");
    await expect(page.getByRole("heading", { name: "データ統計" })).toBeVisible({ timeout: 25000 });

    await page.getByRole("button", { name: "サーバーへ送信" }).click();
    const reRegister = page.getByRole("button", {
      name: "送信して再登録する",
    });
    await reRegister.click({ timeout: 10000 }).catch(() => { });
    // 送信後に「レポートデータの削除」確認ダイアログが表示される場合は「残す」をクリック
    await page
      .getByRole("button", { name: "残す" })
      .click({ timeout: 5000 })
      .catch(() => { });
    await expect(page.getByText(/送信が完了し(ました|、)/)).toBeVisible({ timeout: 15000 });

    // 7. Download: 差分同期は「最終同期日時」がないと無効なので、先にフル同期を1回実行してから差分同期
    await page.getByRole("button", { name: "フル同期" }).click();
    await expect(page.getByText(/フル同期が完了しました/)).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "差分同期", exact: true }).click();
    await expect(page.getByText(/差分同期が完了しました/)).toBeVisible({ timeout: 15000 });
  });
});
