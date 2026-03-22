#!/usr/bin/env zx
import "zx/globals";
import { getProjectRoot, getPnpmPath, runProcess } from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const pnpmBin = getPnpmPath(projectRoot);

  console.log("=== Citadel Restart ===");
  console.log();

  console.log("Stopping services...");
  await runProcess(pnpmBin, ["exec", "zx", "./scripts/stop-all.mjs"], { cwd: projectRoot });

  console.log();
  console.log("Restarting in 3 seconds...");
  await sleep(3000);
  console.log();

  console.log("Starting services...");
  await runProcess(pnpmBin, ["exec", "zx", "./scripts/start-all.mjs"], { cwd: projectRoot });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
