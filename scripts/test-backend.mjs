#!/usr/bin/env node
import path from "node:path";
import { ensureVenvPython, getProjectRoot, runProcess } from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot();
  const backendDir = path.join(projectRoot, "apps", "backend");
  const venvPython = await ensureVenvPython(projectRoot);

  console.log("=== Backend Test (using venv) ===");
  console.log(`Python: ${venvPython}`);

  console.log("Formatting with ruff...");
  await runProcess(venvPython, ["-m", "ruff", "format", "."], { cwd: backendDir });
  await runProcess(venvPython, ["-m", "ruff", "check", ".", "--fix"], { cwd: backendDir });

  console.log();
  console.log("Running tests...");
  // Use fewer workers in CI to avoid resource exhaustion in Docker
  const workerCount = process.env.CI ? "4" : "auto";
  await runProcess(
    venvPython,
    [
      "-m",
      "pytest",
      "-n",
      workerCount,
      "--cov=services",
      "--cov=main",
      "--cov-report=term-missing",
      "--cov-fail-under=70",
      "-v",
    ],
    {
      cwd: backendDir,
    }
  );
}

main().catch((err) => {
  console.error(err);
  if (String(err).includes("Process failed")) {
    console.error("");
    console.error(
      "If you see ModuleNotFoundError above, install backend deps: pip install -r apps/backend/requirements.txt"
    );
  }
  process.exit(1);
});
