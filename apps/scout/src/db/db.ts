import Dexie from "dexie";

import { DB_NAME, ReportDatabase } from "./schema";

export { DB_NAME, ReportDatabase };

// DBリセットが必要かどうかのフラグ（グローバル状態）
let dbResetRequired = false;
let dbResetInProgress = false;

/**
 * スキーマエラーかどうかを判定（Dexie の VersionError / UpgradeError 等）
 */
export function isSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name || "";
  const message = error.message || "";
  return (
    name === "VersionError" ||
    name === "UpgradeError" ||
    name.includes("Version") ||
    message.includes("version") ||
    message.includes("schema") ||
    message.includes("upgrade")
  );
}

/**
 * データベースを削除して再作成
 */
async function resetDatabase(): Promise<ReportDatabase> {
  if (dbResetInProgress) {
    // リセット中は待機
    await new Promise((resolve) => setTimeout(resolve, 100));
    return db;
  }

  dbResetInProgress = true;
  console.warn("[DB] スキーマエラーによりデータベースをリセットします...");

  try {
    // 既存のデータベースを削除
    await Dexie.delete(DB_NAME);
    console.log("[DB] データベースを削除しました");

    // 新しいデータベースインスタンスを作成
    const newDb = new ReportDatabase();
    await newDb.open();
    console.log("[DB] 新しいデータベースを作成しました");

    dbResetRequired = false;
    return newDb;
  } catch (error) {
    console.error("[DB] データベースのリセットに失敗しました:", error);
    throw error;
  } finally {
    dbResetInProgress = false;
  }
}

/**
 * DBリセットが必要かどうか
 */
export function isDbResetRequired(): boolean {
  return dbResetRequired;
}

/**
 * 端末データの初期化: 全データを削除して初期状態に戻す（任務終了モード用）。
 * データベースを削除し、ページをリロードする。
 */
export async function resetLocalDatabase(): Promise<void> {
  await Dexie.delete(DB_NAME);
  window.location.reload();
}

/**
 * ユーザー確認付きでDBをリセット
 * @returns リセットされた場合は true、キャンセルされた場合は false
 */
export async function resetDatabaseWithConfirm(): Promise<boolean> {
  const confirmed = window.confirm(
    "データベースの形式が古いため、リセットが必要です。\n\n" +
      "【注意】未同期のレポートがある場合は、先にエクスポートしてください。\n" +
      "リセットするとローカルに保存されているデータはすべて削除されます。\n" +
      "サーバーから再度データを転送してください。\n\n" +
      "リセットしますか？"
  );

  if (!confirmed) {
    return false;
  }

  try {
    await resetDatabase();
    // ページをリロードして新しいDBで開始
    window.location.reload();
    return true;
  } catch (error) {
    console.error("[DB] リセットに失敗しました:", error);
    alert(
      "データベースのリセットに失敗しました。\nブラウザの設定からサイトデータを手動で削除してください。"
    );
    return false;
  }
}

// データベースインスタンス
export const db = new ReportDatabase();

// グローバルエラーハンドラーを設定（Dexieのエラーをキャッチ）
db.on("blocked", () => {
  console.warn("[DB] データベースがブロックされています。他のタブを閉じてください。");
});

db.on("versionchange", () => {
  console.warn("[DB] データベースのバージョンが変更されました。ページをリロードしてください。");
  db.close();
  window.location.reload();
});

// 初期化時にスキーマエラーをチェック（即時リセットは行わず dbResetRequired のみ設定。UI で案内）
// テスト実行時（Vitest）は自動で open しないように制御する
const isTest = import.meta.env.MODE === "test";

if (typeof window !== "undefined" && !isTest) {
  db.open().catch((error) => {
    console.error("[DB] 初期化エラー:", error);
    if (isSchemaError(error)) {
      dbResetRequired = true;
      console.warn(
        "[DB] スキーマエラーを検出しました。データベースの形式が古いためリセットが必要です。未同期のレポートがある場合は先にエクスポートを推奨します。"
      );
    }
  });
}
