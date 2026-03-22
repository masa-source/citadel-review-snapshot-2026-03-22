#!/usr/bin/env node
import path from "node:path";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

export function getScriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

export function getProjectRoot() {
  return process.cwd();
}

export function getPidDir(projectRoot) {
  return path.join(projectRoot, "scripts", ".pids");
}

export function getPidFilePath(projectRoot, name) {
  return path.join(getPidDir(projectRoot), `${name}.pid`);
}

export async function writePidFile(projectRoot, name, pid) {
  const pidDir = getPidDir(projectRoot);
  await mkdir(pidDir, { recursive: true });
  await writeFile(getPidFilePath(projectRoot, name), String(pid), "utf8");
}

export async function readPidFile(projectRoot, name) {
  try {
    const content = await readFile(getPidFilePath(projectRoot, name), "utf8");
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function removePidFile(projectRoot, name) {
  try {
    await rm(getPidFilePath(projectRoot, name));
  } catch {
    // ignore
  }
}

/**
 * venv の bin ディレクトリを取得
 */
export async function getVenvBinDir(projectRoot) {
  const isWin = process.platform === "win32";
  return path.join(projectRoot, "venv", isWin ? "Scripts" : "bin");
}

/**
 * python 実行コマンドを決定する。
 * Windows では絶対パスによるトラブルを避けるため、コマンド名のみを返す。
 */
export async function ensureVenvPython(projectRoot) {
  const isWin = process.platform === "win32";
  if (isWin) {
    // Windows は PATH 注入で解決するため、単に 'python' を返す
    return "python";
  }
  const binDir = await getVenvBinDir(projectRoot);
  const fullPath = path.join(binDir, "python");
  return existsSync(fullPath) ? fullPath : "python3";
}

function buildEnvWithVenv(baseEnv) {
  const combinedEnv = { ...process.env, ...baseEnv };
  const isWin = process.platform === "win32";
  const projectRoot = getProjectRoot();

  if (isWin) {
    const venvBin = path.join(projectRoot, "venv", "Scripts");
    const pathKey = combinedEnv.Path ? "Path" : "PATH";
    combinedEnv[pathKey] = `${venvBin};${combinedEnv[pathKey] || ""}`;
    combinedEnv.VIRTUAL_ENV = path.join(projectRoot, "venv");
  }

  return combinedEnv;
}

export async function loadEnvFile(filePath) {
  const envVars = {};
  try {
    const content = await readFile(filePath, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const name = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      envVars[name] = value;
      process.env[name] = value;
    }
  } catch {
    // ignore
  }
  return envVars;
}

export function getPnpmPath(projectRoot) {
  const isWin = process.platform === "win32";
  const name = isWin ? "pnpm.cmd" : "pnpm";
  const candidate = path.join(projectRoot, "node_modules", ".bin", name);
  if (existsSync(candidate)) return candidate;
  return "pnpm";
}

/**
 * プロセスを実行する。
 */
export async function runProcess(cmd, args, options = {}) {
  const { cwd, env = {}, shell = false } = options;
  const isWin = process.platform === "win32";
  const combinedEnv = buildEnvWithVenv(env);

  // Windows または pnpm は shell: true を使用
  const useShell = shell || isWin || (typeof cmd === "string" && cmd.includes("pnpm"));

  // Windows で shell: true の場合、コマンドにスペースが含まれていればクォートする
  const safeCmd = isWin && useShell && cmd.includes(" ") && !cmd.startsWith('"') ? `"${cmd}"` : cmd;

  return new Promise((resolve, reject) => {
    const child = spawn(safeCmd, args, {
      cwd,
      env: combinedEnv,
      stdio: "inherit",
      shell: useShell,
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process failed: ${cmd} ${args.join(" ")} (exit code ${code})`));
      }
    });
  });
}

export function spawnManagedProcess(cmd, args, options = {}) {
  const { cwd, env = {}, shell = false, stdio = "inherit" } = options;
  const isWin = process.platform === "win32";
  const combinedEnv = buildEnvWithVenv(env);
  const useShell = shell || isWin || (typeof cmd === "string" && cmd.includes("pnpm"));
  const safeCmd = isWin && useShell && cmd.includes(" ") && !cmd.startsWith('"') ? `"${cmd}"` : cmd;

  const child = spawn(safeCmd, args, {
    cwd,
    env: combinedEnv,
    stdio,
    shell: useShell,
  });

  return child;
}

export async function getPidsByPort(port) {
  const isWin = process.platform === "win32";
  if (!isWin) return []; // 実装が必要な場合は後ほど追加

  try {
    const { stdout } = await runProcessWithOutput("netstat", ["-ano"], { shell: true });
    const lines = stdout.split("\n");
    const pids = new Set();
    const portSearch = `:${port} `;
    for (const line of lines) {
      if (line.includes(portSearch) && line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !Number.isNaN(Number.parseInt(pid, 10))) {
          pids.add(Number.parseInt(pid, 10));
        }
      }
    }
    return Array.from(pids);
  } catch {
    return [];
  }
}

export async function killProcessTree(pid, options = {}) {
  const { port } = options;
  const isWin = process.platform === "win32";

  // PID による終了
  if (pid && !Number.isNaN(pid)) {
    if (isWin) {
      try {
        await runProcess("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: true });
      } catch {
        // ignore
      }
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // ignore
      }
    }
  }

  // ポートによる強制終了 (Windows セーフティネット)
  if (isWin && port) {
    const pids = await getPidsByPort(port);
    for (const p of pids) {
      try {
        await runProcess("taskkill", ["/PID", String(p), "/F", "/T"], { shell: true });
      } catch {
        // ignore
      }
    }
  }
}

export async function runProcessWithOutput(cmd, args, options = {}) {
  const { cwd, env = {} } = options;
  const isWin = process.platform === "win32";
  const combinedEnv = buildEnvWithVenv(env);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: combinedEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
    });

    let stdout = "";
    let stderr = "";
    if (child.stdout)
      child.stdout.on("data", (d) => {
        stdout += d;
      });
    if (child.stderr)
      child.stderr.on("data", (d) => {
        stderr += d;
      });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Process failed: ${cmd} ${args.join(" ")} (exit code ${code})`));
    });
  });
}

/**
 * プロセスを実行し、成功・失敗に関わらず { code, stdout, stderr } を返す。
 * db-migrate の自動復旧で stderr を検査するために使用。
 */
export async function runProcessCapture(cmd, args, options = {}) {
  const { cwd, env = {} } = options;
  const isWin = process.platform === "win32";
  const combinedEnv = buildEnvWithVenv(env);

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: combinedEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
    });

    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (d) => { stdout += String(d); });
    if (child.stderr) child.stderr.on("data", (d) => { stderr += String(d); });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
