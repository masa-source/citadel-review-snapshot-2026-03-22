#!/usr/bin/env zx
import "zx/globals";
import { getProjectRoot, getPnpmPath, runProcess } from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const pnpmBin = getPnpmPath(projectRoot);

  console.log("=== Frontend Start ===");

  console.log("[1/2] Starting Admin...");
  const admin = runProcess(pnpmBin, ["dev:admin"], { cwd: projectRoot });

  await sleep(2000);

  console.log("[2/2] Starting Scout...");
  const scout = runProcess(pnpmBin, ["dev:scout"], { cwd: projectRoot });

  console.log();
  console.log("=== Start Complete ===");
  console.log();
  console.log("Access URLs:");
  console.log("  Scout (Field):     http://localhost:3000");
  console.log("  Admin (Dashboard): http://localhost:3001");
  console.log();
  console.log("Press Ctrl+C in this terminal to stop frontend apps.");

  await Promise.all([admin, scout]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
