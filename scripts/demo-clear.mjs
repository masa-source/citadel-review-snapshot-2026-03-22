#!/usr/bin/env zx
import "zx/globals";
import "./utils.mjs";

async function main() {
  const args = process.argv.slice(2);
  let apiUrl = "http://localhost:8000";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === "--api-url" || arg === "--apiUrl") && args[i + 1]) {
      apiUrl = args[i + 1];
      i += 1;
    }
  }

  console.log("=== Demo Data Clear ===");
  console.log();

  try {
    console.log("デモデータを削除しています...");
    const res = await fetch(`${apiUrl}/api/demo/clear`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const body = await res.json();
    console.log();
    console.log(`成功: ${body.message}`);
    console.log();

    if (body.counts && typeof body.counts === "object") {
      console.log("削除件数:");
      for (const [key, value] of Object.entries(body.counts)) {
        if (typeof value === "number" && value > 0) {
          console.log(`  ${key}: ${value}`);
        }
      }
    }

    console.log();
    console.log("=== Done ===");
  } catch (err) {
    console.error(`エラー: ${err}`);
    console.error();
    console.error(`サーバーが起動しているか確認してください: ${apiUrl}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
