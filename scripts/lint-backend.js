#!/usr/bin/env node
/**
 * CI と同等の ruff チェックを apps/backend で実行（format --check + check）。
 * 使い方: pnpm lint:backend
 * venv がない場合は警告してスキップ。
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

// プロジェクトルートをカレントディレクトリから取得
const projectRoot = process.cwd();
const backendDir = path.join(projectRoot, "apps", "backend");
const isWin = process.platform === "win32";

const venvDir = path.join(projectRoot, "venv");
const binDir = isWin ? path.join(venvDir, "Scripts") : path.join(venvDir, "bin");

// 実行ファイルへのフルパスを取得
const getToolPath = (toolName) => {
  const exeName = isWin ? `${toolName}.exe` : toolName;
  const tool = path.join(binDir, exeName);

  if (fs.existsSync(tool)) {
    // Windows ではスペースを含むパス対策でクォートする
    return isWin ? `"${tool}"` : tool;
  }
  return toolName; // フォールバック
};

const venvPython = path.join(binDir, isWin ? "python.exe" : "python");

if (!fs.existsSync(venvPython)) {
  console.warn(`[lint:backend] venv が見つかりません (${venvPython})。スキップします。`);
  process.exit(0);
}

const runTool = (toolName, args) => {
  const toolPath = getToolPath(toolName);
  if (!toolPath) {
    console.warn(`[lint:backend] ${toolName} 縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲ゅせ繧ｭ繝縺励∪縺吶`);
    return;
  }

  // getToolPath 縺ｧ縺吶〒縺ｫ繧ｯ繧ｩ繝ｼ繝育ｵゆｺ＠縺ｦ縺ｋ蝣ｴ蜷医縺昴縺ｾ縺ｾ菴ｿ逕ｨ
  const cmd = `${toolPath} ${args.join(" ")}`;
  execSync(cmd, {
    stdio: "inherit",
    cwd: backendDir,
    env: { ...process.env, VIRTUAL_ENV: venvDir }, // venv の環境変数を付与
  });
};

try {
  runTool("ruff", ["format", "--check", "."]);
  runTool("ruff", ["check", "."]);
  runTool("pyright", ["."]);
  runTool("bandit", ["-r", ".", "-x", "./tests"]);
} catch (e) {
  process.exit(e.status ?? 1);
}
