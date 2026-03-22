#!/usr/bin/env zx
import "zx/globals";
import net from "node:net";
import { getProjectRoot, readPidFile, runProcessWithOutput } from "./utils.mjs";

async function isPortOpen(port, host = "localhost", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host, () => done(true));
  });
}

async function checkDocker(projectRoot) {
  try {
    const { stdout } = await runProcessWithOutput(
      "docker",
      ["ps", "--filter", "name=report_system", "--format", "{{.Names}}"],
      { cwd: projectRoot }
    );
    const names = stdout.trim();
    if (names) {
      console.log("[PostgreSQL] Running (port 5432)");
    } else {
      console.log("[PostgreSQL] Stopped");
    }
  } catch {
    console.log("[PostgreSQL] Unknown (docker not available?)");
  }
}

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);

  console.log("=== Citadel Status ===");
  console.log();

  await checkDocker(projectRoot);

  const [backendUp, adminUp, scoutUp, backendPid, adminPid, scoutPid, port3002, port3003] =
    await Promise.all([
      isPortOpen(8000),
      isPortOpen(3001),
      isPortOpen(3000),
      readPidFile(projectRoot, "backend"),
      readPidFile(projectRoot, "admin"),
      readPidFile(projectRoot, "scout"),
      isPortOpen(3002),
      isPortOpen(3003),
    ]);

  console.log(
    `[Backend]    ${backendUp ? "Running (http://localhost:8000)" : "Stopped"}` +
      (backendPid ? ` [pid=${backendPid}]` : " [pid=unknown]")
  );
  console.log(
    `[Admin]      ${adminUp ? "Running (http://localhost:3001)" : "Stopped"}` +
      (adminPid ? ` [pid=${adminPid}]` : " [pid=unknown]")
  );
  console.log(
    `[Scout]      ${scoutUp ? "Running (http://localhost:3000)" : "Stopped"}` +
      (scoutPid ? ` [pid=${scoutPid}]` : " [pid=unknown]")
  );
  console.log();

  if (!scoutUp && (port3002 || port3003)) {
    console.log(
      `[Warning] Scout is not listening on :3000, but a process is listening on ${[
        port3002 ? 3002 : null,
        port3003 ? 3003 : null,
      ]
        .filter((p) => p !== null)
        .join(", ")}. This is unexpected (expected port 3000).`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
