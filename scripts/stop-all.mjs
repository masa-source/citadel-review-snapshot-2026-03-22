#!/usr/bin/env zx
import "zx/globals";
import {
  getProjectRoot,
  killProcessTree,
  readPidFile,
  removePidFile,
  runProcess,
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
      runId: "stop-all",
      hypothesisId,
      location: "scripts/stop-all.mjs",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion agent log

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);

  console.log("=== Citadel Stop ===");

  console.log("[1/2] Stopping application processes (Backend/Admin/Scout)...");
  const services = [
    { name: "backend", port: 8000 },
    { name: "admin", port: 3001 },
    { name: "scout", port: 3000 },
  ];
  for (const { name, port } of services) {
    const pid = await readPidFile(projectRoot, name);

    if (pid) {
      console.log(`[${name}] Killing PID ${pid}...`);
    } else {
      console.log(`[${name}] PID file not found, checking port ${port}...`);
    }

    await killProcessTree(pid, { port });
    await removePidFile(projectRoot, name);
    debugLog("H5", "killed service", { service: name, pid, port });
  }

  console.log("[2/2] Stopping PostgreSQL (Docker)...");
  try {
    await runProcess("docker", ["compose", "down"], { cwd: projectRoot });
  } catch (err) {
    console.error("Failed to stop Docker containers (docker compose down).");
    console.error(err);
    process.exit(1);
  }

  console.log();
  console.log("=== Stop Complete ===");
  console.log("If dev servers are still running, stop them with Ctrl+C in their terminals.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
