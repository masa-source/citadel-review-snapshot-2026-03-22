#!/usr/bin/env zx
import "zx/globals";
import { getProjectRoot, runProcess } from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);

  console.log("=== Database Reset ===");
  console.log();
  console.log("WARNING: This will delete all data!");
  console.log();

  const answer = (await question("Are you sure? (yes/no) ")).trim().toLowerCase();
  if (answer !== "yes") {
    console.log("Cancelled.");
    return;
  }

  console.log();
  console.log("[1/3] Stopping Docker container...");
  await runProcess("docker", ["compose", "down"], { cwd: projectRoot });

  console.log("[2/3] Removing volume...");
  await runProcess("docker", ["volume", "rm", "report_system_postgres_data", "-f"], {
    cwd: projectRoot,
  });

  console.log("[3/3] Restarting Docker container...");
  await runProcess("docker", ["compose", "up", "-d"], { cwd: projectRoot });

  console.log();
  console.log("=== Reset Complete ===");
  console.log("Database has been initialized.");
  console.log("Restart Backend to auto-create tables.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
