/**
 * E2E 実行前に Backend / Scout / Admin の起動を確認するのみ。
 * サービスは自動起動しない。事前に別ターミナルで `pnpm start` を実行しておくこと。
 */

const BACKEND_URL = "http://localhost:8000/api/reports";
const SCOUT_URL = "http://localhost:3000";
const ADMIN_URL = "http://localhost:3001";

/** 確認の最大待機時間（全サービスが応答するまで） */
const CHECK_TIMEOUT_MS = 10_000;
/** 1 回の fetch の最大待機（接続ハング防止） */
const REQUEST_TIMEOUT_MS = 2500;

async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.ok || res.status === 304) return true;
    } catch {
      clearTimeout(t);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const isCI = process.env.CI === "true";
  if (isCI) {
    console.log(
      "[globalSetup] E2E (CI): Backend の起動を確認しています（Scout/Admin は Playwright の webServer が起動します）..."
    );
  } else {
    console.log(
      "[globalSetup] E2E: Backend / Scout / Admin の起動を確認しています（事前に pnpm start を実行してください）..."
    );
  }

  const backendUp = await waitForUrl(BACKEND_URL, CHECK_TIMEOUT_MS);
  if (!backendUp) {
    throw new Error(
      [
        "E2E を実行するには、Backend(8000) が起動している必要があります。",
        isCI
          ? "CI では Backend が起動していることを確認してください。"
          : "事前に別ターミナルで pnpm start を実行し、Backend / Scout / Admin を起動してください。",
        "",
        `確認結果: Backend(8000)=${backendUp ? "OK" : "未起動"}`,
      ].join("\n")
    );
  }

  if (!isCI) {
    const [scoutUp, adminUp] = await Promise.all([
      waitForUrl(SCOUT_URL, CHECK_TIMEOUT_MS),
      waitForUrl(ADMIN_URL, CHECK_TIMEOUT_MS),
    ]);
    if (!scoutUp || !adminUp) {
      throw new Error(
        [
          "E2E を実行するには、事前に別ターミナルで pnpm start を実行し、Backend / Scout / Admin を起動してください。",
          "",
          `確認結果: Backend(8000)=OK, Scout(3000)=${scoutUp ? "OK" : "未起動"}, Admin(3001)=${adminUp ? "OK" : "未起動"}`,
          "",
          "例: ターミナル1で `pnpm start` → 起動完了後、ターミナル2で `pnpm test:e2e`",
        ].join("\n")
      );
    }
  }

  console.log("[globalSetup] 確認完了。テストを開始します。");
  return async () => {};
}
