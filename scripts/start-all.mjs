#!/usr/bin/env zx
import "zx/globals";
import path from "node:path";
import {
  ensureVenvPython,
  getProjectRoot,
  getPnpmPath,
  runProcess,
  spawnManagedProcess,
  writePidFile,
  getPidsByPort,
} from "./utils.mjs";

// #region agent log
function debugLog(hypothesisId, message, data = {}) {
  // eslint-disable-next-line no-void
  void fetch("http://127.0.0.1:7242/ingest/94b6906e-07df-4dad-90e1-9efb8f6f10ac", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "142465",
    },
    body: JSON.stringify({
      sessionId: "142465",
      runId: "start-all",
      hypothesisId,
      location: "scripts/start-all.mjs",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion agent log

const promiseBasedSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const backendDir = path.join(projectRoot, "apps", "backend");
  const venvPython = await ensureVenvPython(projectRoot);
  const pnpmBin = getPnpmPath(projectRoot);

  debugLog("H1", "start-all main entry", { projectRoot, backendDir, pnpmBin });

  console.log("=== Citadel Start ===");

  // 1. Docker (PostgreSQL)
  console.log("[1/4] Starting PostgreSQL (Docker)...");
  await runProcess("docker", ["compose", "up", "-d"], { cwd: projectRoot });
  console.log("Waiting for PostgreSQL to be ready (5s)...");
  await promiseBasedSleep(5000);

  // 2. Backend (FastAPI)
  console.log("[2/4] Starting Backend (FastAPI)...");
  const backendChild = spawnManagedProcess(
    venvPython,
    ["-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
    { cwd: backendDir }
  );
  if (backendChild.pid) {
    await writePidFile(projectRoot, "backend", backendChild.pid);
    debugLog("H2", "backend child spawned and pid written", { pid: backendChild.pid });
  }
  // ポート 8000 が開くまで待機 (最大 10秒)
  let retry = 0;
  while (retry < 20) {
    const isListening = await getPidsByPort(8000)
      .then((pids) => pids.length > 0)
      .catch(() => false);
    if (isListening) break;
    await promiseBasedSleep(500);
    retry++;
  }

  // 3. Admin
  console.log("[3/4] Starting Admin...");
  const adminChild = spawnManagedProcess(pnpmBin, ["dev:admin"], { cwd: projectRoot });
  if (adminChild.pid) {
    await writePidFile(projectRoot, "admin", adminChild.pid);
    debugLog("H3", "admin child spawned and pid written", { pid: adminChild.pid });
  }
  // ポート 3001 が開くまで待機
  retry = 0;
  while (retry < 20) {
    const isListening = await getPidsByPort(3001)
      .then((pids) => pids.length > 0)
      .catch(() => false);
    if (isListening) break;
    await promiseBasedSleep(500);
    retry++;
  }

  // 4. Scout
  console.log("[4/4] Starting Scout...");
  const scoutChild = spawnManagedProcess(pnpmBin, ["dev:scout"], { cwd: projectRoot });
  if (scoutChild.pid) {
    await writePidFile(projectRoot, "scout", scoutChild.pid);
    debugLog("H4", "scout child spawned and pid written", { pid: scoutChild.pid });
  }
  // ポート 3000 が開くまで待機
  retry = 0;
  while (retry < 20) {
    const isListening = await getPidsByPort(3000)
      .then((pids) => pids.length > 0)
      .catch(() => false);
    if (isListening) break;
    await promiseBasedSleep(500);
    retry++;
  }

  console.log();
  console.log("=== Start Complete ===");
  console.log();
  console.log("Access URLs:");
  console.log("  Scout (Field):     http://localhost:3000");
  console.log("  Admin (Dashboard): http://localhost:3001");
  console.log("  Backend API:       http://localhost:8000");
  console.log("  API Docs:          http://localhost:8000/docs");
  console.log();
  console.log("Press Ctrl+C in this terminal to stop dev servers.");
  console.log("Or run `pnpm stop` from another terminal to stop all services.");

  await Promise.all([
    new Promise((resolve, reject) => {
      backendChild.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Backend exited with code ${code}`))
      );
      backendChild.on("error", reject);
    }),
    new Promise((resolve, reject) => {
      adminChild.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Admin exited with code ${code}`))
      );
      adminChild.on("error", reject);
    }),
    new Promise((resolve, reject) => {
      scoutChild.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Scout exited with code ${code}`))
      );
      scoutChild.on("error", reject);
    }),
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
