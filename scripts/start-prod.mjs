#!/usr/bin/env zx
import "zx/globals";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  ensureVenvPython,
  getProjectRoot,
  getPnpmPath,
  loadEnvFile,
  runProcess,
} from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const backendDir = path.join(projectRoot, "apps", "backend");
  const adminDir = path.join(projectRoot, "apps", "admin");
  const scoutDir = path.join(projectRoot, "apps", "scout");
  const venvPython = await ensureVenvPython(projectRoot);
  const pnpmBin = getPnpmPath(projectRoot);

  console.log("========================================");
  console.log("  Citadel - Production Mode Start");
  console.log("========================================");
  console.log();

  // External config (optional)
  const externalEnvFile = process.env.CITADEL_ENV_FILE || "";
  const externalOverrideFile = process.env.CITADEL_COMPOSE_OVERRIDE || "";

  let envFile = "";
  let overrideFile = "";

  if (externalEnvFile && existsSync(externalEnvFile)) {
    envFile = externalEnvFile;
    console.log(`[INFO] Using external env file: ${envFile}`);
  } else {
    envFile = path.join(projectRoot, ".env");
    if (existsSync(envFile)) {
      console.log("[WARNING] Using local .env file (not recommended for production)");
    }
  }

  if (externalOverrideFile && existsSync(externalOverrideFile)) {
    overrideFile = externalOverrideFile;
    console.log(`[INFO] Using external override file: ${overrideFile}`);
  } else {
    overrideFile = path.join(projectRoot, "docker-compose.override.yml");
    if (existsSync(overrideFile)) {
      console.log(
        "[WARNING] Using local docker-compose.override.yml (not recommended for production)"
      );
    }
  }

  const missingFiles = [];
  if (!existsSync(envFile)) {
    missingFiles.push(".env (or set CITADEL_ENV_FILE)");
  }
  if (!existsSync(overrideFile)) {
    missingFiles.push("docker-compose.override.yml (or set CITADEL_COMPOSE_OVERRIDE)");
  }

  if (missingFiles.length > 0) {
    console.error("[ERROR] Required files not found:");
    for (const file of missingFiles) {
      console.error(`  - ${file}`);
    }
    console.log();
    console.log("Setup steps (recommended - external files):");
    console.log("  1. mkdir C:\\secrets\\citadel");
    console.log("  2. copy .env.example C:\\secrets\\citadel\\.env");
    console.log(
      "  3. copy docker-compose.override.yml.example C:\\secrets\\citadel\\docker-compose.override.yml"
    );
    console.log("  4. Edit each file with production settings");
    console.log("  5. Set CITADEL_ENV_FILE and CITADEL_COMPOSE_OVERRIDE as environment variables");
    console.log("  6. Restart your shell");
    console.log();
    process.exit(1);
  }

  // Warn if production template directory is missing
  const templateLocalDir = path.join(projectRoot, "apps", "backend", "assets", "template-local");
  if (!existsSync(templateLocalDir)) {
    console.log("[WARNING] Production template directory not found:");
    console.log(`  ${templateLocalDir}`);
    console.log("  Default templates will be used.");
    console.log();
  }

  // Load environment variables from env file
  console.log("[1/6] Loading environment variables...");
  const envVars = await loadEnvFile(envFile);
  const dbUrl = envVars.DATABASE_URL || process.env.DATABASE_URL || "";
  const templateDir = envVars.TEMPLATE_DIR || process.env.TEMPLATE_DIR || "";

  // 2. Docker (PostgreSQL)
  console.log("[2/6] Starting PostgreSQL (Docker)...");
  if (externalOverrideFile && existsSync(externalOverrideFile)) {
    console.log("[PostgreSQL] Production mode (external config)");
    await runProcess(
      "docker",
      ["compose", "-f", "docker-compose.yml", "-f", overrideFile, "up", "-d"],
      { cwd: projectRoot }
    );
  } else {
    console.log("[PostgreSQL] Production mode");
    await runProcess("docker", ["compose", "up", "-d"], { cwd: projectRoot });
  }
  console.log("Waiting for PostgreSQL to be ready (5s)...");
  await sleep(5000);

  // 3. Database migration
  console.log("[3/6] Running database migrations...");
  try {
    await runProcess(pnpmBin, ["run", "db:migrate"], { cwd: projectRoot });
  } catch (err) {
    console.error("[ERROR] Migration failed.");
    console.error(err);
    process.exit(1);
  }

  // 4. Build Admin and Scout (production bundles)
  // ビルド時に .env の VITE_* を明示的に渡す（Turbo/Windows で process.env が継承されない場合の対策）
  console.log("[4/6] Building Admin and Scout (production)...");
  const buildEnv = {};
  for (const [k, v] of Object.entries(envVars)) {
    if (k.startsWith("VITE_") && v !== undefined && v !== "") buildEnv[k] = v;
  }
  try {
    await runProcess(pnpmBin, ["build"], { cwd: projectRoot, env: buildEnv });
  } catch (err) {
    console.error("[ERROR] Build failed.");
    console.error(err);
    process.exit(1);
  }

  // 5. Backend (FastAPI) - no reload
  // バックエンドには .env の変数を継承させる（ALLOWED_ORIGINS 等）。DATABASE_URL / TEMPLATE_DIR は明示的に渡す。
  console.log("[5/6] Starting Backend (FastAPI, no reload)...");
  const backendEnv = { ...envVars };
  if (dbUrl) backendEnv.DATABASE_URL = dbUrl;
  if (templateDir) backendEnv.TEMPLATE_DIR = templateDir;
  const backend = runProcess(
    venvPython,
    ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"],
    { cwd: backendDir, env: backendEnv }
  );

  // 6. Admin and Scout (built apps)
  console.log("[6/6] Starting Admin and Scout (built apps)...");
  const admin = runProcess(pnpmBin, ["start"], { cwd: adminDir });
  const scout = runProcess(pnpmBin, ["start"], { cwd: scoutDir });

  console.log();
  console.log("========================================");
  console.log("  Production Mode Started");
  console.log("========================================");
  console.log();
  console.log("Access URLs:");
  console.log("  Scout (Field):     http://localhost:3000");
  console.log("  Admin (Dashboard): http://localhost:3001");
  console.log("  Backend API:       http://localhost:8000");
  console.log("  API Docs:          http://localhost:8000/docs");
  console.log();
  console.log("[CAUTION] Using PRODUCTION data. Please be careful.");
  console.log();
  console.log(
    "If you access Scout/Admin by IP (e.g. http://192.168.x.x:3000), set in .env:"
  );
  console.log(
    "  ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://YOUR_IP:3000,http://YOUR_IP:3001"
  );
  console.log(
    "  VITE_API_URL=http://YOUR_IP:8000  (optional; omit to use current host:8000)"
  );
  console.log(
    "Then restart with: pnpm start:prod"
  );
  console.log();
  console.log(
    "Press Ctrl+C in this terminal to stop services (and then `pnpm db:down` if needed)."
  );

  await Promise.all([backend, admin, scout]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
