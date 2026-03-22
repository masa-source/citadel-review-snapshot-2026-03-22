#!/usr/bin/env zx
import "zx/globals";
import path from "node:path";
import { ensureVenvPython, getProjectRoot, runProcess } from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const backendDir = path.join(projectRoot, "apps", "backend");
  const venvPython = await ensureVenvPython(projectRoot);

  console.log("=== Backend Start ===");

  // 1. Docker (PostgreSQL)
  console.log("[1/2] Starting PostgreSQL (Docker)...");
  await runProcess("docker", ["compose", "up", "-d"], { cwd: projectRoot });
  console.log("Waiting for PostgreSQL to be ready (5s)...");
  await sleep(5000);

  // 2. Backend (FastAPI)
  console.log("[2/2] Starting Backend (FastAPI)...");
  const backend = runProcess(
    venvPython,
    ["-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
    { cwd: backendDir }
  );

  console.log();
  console.log("=== Start Complete ===");
  console.log();
  console.log("Access URLs:");
  console.log("  Backend API:  http://localhost:8000");
  console.log("  API Docs:     http://localhost:8000/docs");
  console.log();
  console.log("Press Ctrl+C in this terminal to stop the backend.");

  await backend;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
