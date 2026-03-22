#!/usr/bin/env node
/**
 * Run ruff via project venv for lint-staged (cross-platform).
 * Usage: node scripts/lint-staged-ruff.js <ruff-subcommand> [--fix] [files...]
 * Example: node scripts/lint-staged-ruff.js check --fix apps/backend/main.py
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

const venvDir = path.join(projectRoot, "venv");
const binDir = isWin ? path.join(venvDir, "Scripts") : path.join(venvDir, "bin");
const venvPython = path.join(binDir, isWin ? "python.exe" : "python");

const args = process.argv.slice(2);
if (args.length === 0) {
  process.exit(0);
}

if (!fs.existsSync(venvPython)) {
  console.warn("[lint-staged-ruff] venv not found; skipping backend lint. Create venv to enable.");
  process.exit(0);
}

// 実行ファイルへのフルパスを取得 (ruff.exe or ruff)
const ruffExe = isWin ? "ruff.exe" : "ruff";
const ruffPath = path.join(binDir, ruffExe);

try {
  const finalRuff = fs.existsSync(ruffPath) ? ruffPath : venvPython;
  const isDirect = finalRuff === ruffPath;

  const cmd = isDirect
    ? `"${finalRuff}" ${args.join(" ")}`
    : `"${venvPython}" -m ruff ${args.join(" ")}`;

  execSync(cmd, {
    stdio: "inherit",
    cwd: projectRoot,
    env: { ...process.env, VIRTUAL_ENV: venvDir }, // venv の環境変数を付与
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
