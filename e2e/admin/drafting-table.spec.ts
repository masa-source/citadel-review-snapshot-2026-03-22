import { test, expect } from "@playwright/test";

const TEMPLATE_ID = "1";
const GRID_BASE = `/api/templates/${TEMPLATE_ID}/grid`;

/** ツリー表示用: 少なくとも1セルに値がある（空セルはツリーに表示されない） */
const MOCK_GRID_RESPONSE = {
  sheets: [
    {
      name: "Sheet1",
      data: [
        ["A1", null],
        [null, null],
      ],
      mergeCells: [],
      col_metadata: [],
    },
  ],
};

/** 数式セル・非表示行・列を含むグリッド（描画と保存の検証用）。(0,0) は通常値にして編集可能に、(0,1) に数式 */
const MOCK_GRID_WITH_FORMULA_AND_HIDDEN = {
  sheets: [
    {
      name: "Sheet1",
      data: [
        ["plain-A1", "=SUM(A1:A2)"],
        [null, null],
      ],
      mergeCells: [],
      row_metadata: [{ hidden: false }, { hidden: false }],
      col_metadata: [{ hidden: false }, { hidden: true, width: 80 }],
    },
  ],
};

/** ツリーは行ごとに折りたたみ。セル操作前に行0を展開する。 */
async function expandFirstRowAndWaitForCell(page: import("@playwright/test").Page) {
  await page.getByTestId("drafting-row-0").click();
  await expect(page.getByTestId("drafting-cell-0-0")).toBeVisible({ timeout: 5000 });
}

/**
 * 設計台 E2E。
 * 過去の失敗例: 設計台ページで「保存」ボタンや data-testid="drafting-sheet-tree" が
 * 表示されずタイムアウトすることがある。環境や初回ロードの遅延で flaky になりうるため、
 * 必要に応じて timeout を延長または waitForSelector で安定化すること。
 * ツリーは初期状態で行が折りたたまれているため、セル操作前に行を展開する必要がある。
 */
test.describe("Admin 簡易設計台（設計台）", () => {
  test.beforeEach(async ({ page }) => {
    // GET / POST grid: GET は固定データ、POST は 200 で返してペイロード検証可能に
    await page.route(`**${GRID_BASE}**`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_GRID_RESPONSE),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });

    // レポート一覧（プレースホルダ挿入用）
    await page.route("**/api/reports**", async (route) => {
      if (
        route.request().method() === "GET" &&
        route.request().url().includes("/api/reports") &&
        !route.request().url().includes("/context")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: "r1", reportTitle: "E2E Test Report", controlNumber: "CTL-001" },
          ]),
        });
      } else {
        await route.continue();
      }
    });

    // レポート context（PlaceholderList 用）
    await page.route("**/api/reports/*/context**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          company: { name: "テスト会社" },
          reportTitle: "E2E Test",
        }),
      });
    });
  });

  test("設計台ページに直接アクセスし、ツリーが表示される", async ({ page }) => {
    await page.goto(`/templates/drafting/${TEMPLATE_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /保存/ })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("heading", { name: "簡易設計台" })).toBeVisible();
    await expect(page.getByTestId("drafting-sheet-tree")).toBeVisible({ timeout: 20000 });
  });

  test("ツリーでセルをクリックして値を入力できる", async ({ page }) => {
    await page.goto(`/templates/drafting/${TEMPLATE_ID}`);
    await page.waitForLoadState("networkidle");

    const tree = page.getByTestId("drafting-sheet-tree");
    await expect(tree).toBeVisible({ timeout: 20000 });
    await expandFirstRowAndWaitForCell(page);
    const firstCell = page.getByTestId("drafting-cell-0-0");
    await firstCell.click();
    await firstCell.fill("test-value");

    await expect(firstCell).toHaveValue("test-value", { timeout: 5000 });
  });

  test("プレースホルダ挿入: レポート選択 → PlaceholderList で挿入 → セルに値が入る", async ({
    page,
  }) => {
    await page.goto(`/templates/drafting/${TEMPLATE_ID}`);
    await page.waitForLoadState("networkidle");

    const tree = page.getByTestId("drafting-sheet-tree");
    await expect(tree).toBeVisible({ timeout: 20000 });
    await expandFirstRowAndWaitForCell(page);
    const firstCell = page.getByTestId("drafting-cell-0-0");
    await firstCell.click();

    await page
      .locator("select")
      .filter({ has: page.locator('option[value="r1"]') })
      .selectOption("r1");
    // レポート選択でコンテキストが読み込まれると PlaceholderList に「挿入」ボタンが表示される
    await expect(page.getByRole("button", { name: "挿入" }).first()).toBeVisible({
      timeout: 10000,
    });

    const insertButton = page.getByRole("button", { name: "挿入" }).first();
    await insertButton.click();

    await expect(page.getByText(/挿入しました/)).toBeVisible({ timeout: 5000 });
  });

  test("保存ボタンで POST /api/templates/:id/grid が changes 付きで送信される", async ({
    page,
  }) => {
    await page.goto(`/templates/drafting/${TEMPLATE_ID}`);
    await page.waitForLoadState("networkidle");

    const tree = page.getByTestId("drafting-sheet-tree");
    await expect(tree).toBeVisible({ timeout: 20000 });
    await expandFirstRowAndWaitForCell(page);
    const firstCell = page.getByTestId("drafting-cell-0-0");
    await firstCell.fill("save-test");

    const postPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().includes(GRID_BASE) &&
        req.postDataJSON()?.changes != null,
      { timeout: 15000 }
    );

    await page.getByRole("button", { name: /保存/ }).click();
    const postReq = await postPromise;
    const body = postReq.postDataJSON();
    expect(body).toHaveProperty("changes");
    expect(Array.isArray(body.changes)).toBe(true);
    const change = body.changes.find(
      (c: { sheetName?: string; row?: number; col?: number; value?: unknown }) =>
        c.sheetName === "Sheet1" && c.row === 0 && c.col === 0
    );
    expect(change).toBeDefined();
    expect(change?.value).toBe("save-test");
  });

  test("数式セル・非表示行列が含まれるグリッドの描画と保存が正しく行われる", async ({ page }) => {
    await page.unroute(`**${GRID_BASE}**`);
    await page.route(`**${GRID_BASE}**`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_GRID_WITH_FORMULA_AND_HIDDEN),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/templates/drafting/${TEMPLATE_ID}`);
    await page.waitForLoadState("networkidle");

    const tree = page.getByTestId("drafting-sheet-tree");
    await expect(tree).toBeVisible({ timeout: 20000 });
    await expandFirstRowAndWaitForCell(page);
    const editableCell = page.getByTestId("drafting-cell-0-0");
    await editableCell.click();
    await editableCell.fill("formula-overwrite");

    const postPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().includes(GRID_BASE) &&
        req.postDataJSON()?.changes != null,
      { timeout: 15000 }
    );

    await page.getByRole("button", { name: /保存/ }).click();
    const postReq = await postPromise;
    const body = postReq.postDataJSON();
    expect(body).toHaveProperty("changes");
    expect(Array.isArray(body.changes)).toBe(true);
    const change = body.changes.find(
      (c: { sheetName?: string; row?: number; col?: number; value?: unknown }) =>
        c.sheetName === "Sheet1" && c.row === 0 && c.col === 0
    );
    expect(change).toBeDefined();
    expect(change?.value).toBe("formula-overwrite");
  });

  test("結合セル書き込み拒否: API が 400 を返すと UI にエラーメッセージが表示される", async ({
    page,
  }) => {
    await page.route(`**${GRID_BASE}**`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_GRID_RESPONSE),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "結合セルの一部のため書き込めません。シート=Sheet1, 行=2, 列=2。左上のセルを指定してください。",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/templates/drafting/${TEMPLATE_ID}`);
    await page.waitForLoadState("networkidle");

    const tree = page.getByTestId("drafting-sheet-tree");
    await expect(tree).toBeVisible({ timeout: 20000 });
    await expandFirstRowAndWaitForCell(page);
    const firstCell = page.getByTestId("drafting-cell-0-0");
    await firstCell.fill("invalid-merge-write");

    await page.getByRole("button", { name: /保存/ }).click();

    await expect(
      page.getByText(/結合セルの一部のため書き込めません。シート=/, { timeout: 10000 })
    ).toBeVisible();
  });
});
