/**
 * Dagger を用いたローカル CI (最終安定版)
 */
import { connect, ReturnType } from "@dagger.io/dagger";
import fs from "node:fs";

async function main(): Promise<void> {
  console.log("🚀 Starting Dagger Local CI (Stable Mode)...");

  await connect(
    async (client) => {
      try {
        // 共通設定
        const pnpmStore = client.cacheVolume("pnpm-store-cache");
        const pipCache = client.cacheVolume("pip-cache");

        const nodeInclude = [
          "**/package.json",
          "**/tsconfig.json",
          "**/pnpm-workspace.yaml",
          "**/turbo.json",
          "**/*.ts",
          "**/*.tsx",
          "**/*.js",
          "**/*.mjs",
          "**/*.json",
          "**/*.html",
          "**/*.css",
          "**/public/**",
          "**/src/**",
          "**/.eslintrc*",
          "**/.prettier*",
          "**/vitest.config.ts",
          "**/vite.config.ts",
          "**/tailwind.config.*",
          "**/postcss.config.*",
        ];
        const pythonInclude = [
          "**/*.py",
          "**/*.txt",
          "**/*.ini",
          "**/alembic/**",
          "**/tests/**",
          "**/data/**",
          "**/config/**",
        ];
        const commonExclude = [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/.turbo/**",
          "**/venv/**",
          "**/.ruff_cache/**",
        ];

        const packagesDir = client
          .host()
          .directory("packages", { include: nodeInclude, exclude: commonExclude });
        const appsDir = client
          .host()
          .directory("apps", { include: nodeInclude, exclude: commonExclude });
        const sharedDir = client.host().directory("shared", { include: ["**/*.json", "**/*.ts"] });
        const scriptsDir = client
          .host()
          .directory("scripts", { include: ["**/*.mjs", "**/*.js", "**/*.ts"] });
        const backendDir = client
          .host()
          .directory("apps/backend", { include: pythonInclude, exclude: commonExclude });

        // --- 1. Node.js Base Setup ---
        console.log("🛠️  Setting up Node.js environment...");
        let nodeBase = client
          .container()
          .from("node:20")
          .withWorkdir("/src")
          .withEnvVariable("CI", "true")
          .withEnvVariable("PNPM_HOME", "/root/.local/share/pnpm")
          .withExec(["corepack", "enable"])
          .withMountedCache("/root/.local/share/pnpm/store", pnpmStore);

        const rootFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json"];
        for (const f of rootFiles) {
          if (fs.existsSync(f)) {
            nodeBase = nodeBase.withMountedFile(`/src/${f}`, client.host().file(f));
          }
        }

        nodeBase = nodeBase
          .withMountedDirectory("/src/packages", packagesDir)
          .withMountedDirectory("/src/apps", appsDir)
          .withMountedDirectory("/src/shared", sharedDir)
          .withMountedDirectory("/src/scripts", scriptsDir)
          .withExec(["pnpm", "install", "--frozen-lockfile"]);

        // --- 2. Frontend Check ---
        console.log("🧪 Running Frontend Validations...");
        const frontendResult = await nodeBase
          .withExec(["pnpm", "turbo", "run", "lint", "build", "test", "--filter=!@citadel/scout"])
          .exitCode();
        if (frontendResult !== 0) {
          console.error("❌ Frontend validations failed.");
          process.exit(1);
        }

        // --- 3. Database Setup ---
        console.log("🐘 Starting Database service...");
        const postgresSvc = client
          .container()
          .from("postgres:15-alpine")
          .withEnvVariable("POSTGRES_USER", "citadel")
          .withEnvVariable("POSTGRES_PASSWORD", "citadel")
          .withEnvVariable("POSTGRES_DB", "citadel")
          .withExposedPort(5432)
          .asService({ useEntrypoint: true });

        // --- 4. Backend Check ---
        console.log("🐍 Running Backend Validations...");
        const backendTest = client
          .container()
          .from("python:3.11-slim")
          .withServiceBinding("db", postgresSvc)
          .withMountedDirectory("/src/apps/backend", backendDir)
          .withMountedDirectory("/src/shared", sharedDir)
          .withMountedFile("/src/package.json", client.host().file("package.json"))
          .withWorkdir("/src/apps/backend")
          // ホスト名は withServiceBinding で指定した "db" を使用
          .withEnvVariable("DATABASE_URL", "postgresql+asyncpg://citadel:citadel@db:5432/citadel")
          .withEnvVariable("PYTEST_ASYNCIO_MODE", "auto")
          .withEnvVariable("CI", "true")
          .withMountedCache("/root/.cache/pip", pipCache)
          .withExec(["apt-get", "update"])
          .withExec(["apt-get", "install", "-y", "postgresql-client"])
          .withExec(["pip", "install", "-q", "-r", "requirements.txt"])
          .withExec([
            "pip",
            "install",
            "-q",
            "pytest",
            "pytest-asyncio",
            "pytest-cov",
            "pytest-timeout",
            "pytest-xdist",
            "httpx",
            "aiosqlite",
            "ruff",
            "alembic",
            "psycopg2-binary",
          ])
          .withExec(["sh", "-c", "until pg_isready -h db -p 5432 -U citadel; do sleep 1; done"])
          .withExec(["python", "-m", "alembic", "upgrade", "head"])
          .withExec(
            ["python", "-m", "pytest", "-n", "auto", "--cov=services", "--cov-fail-under=70", "-v"],
            { expect: ReturnType.Any }
          );

        const backendResult = await backendTest.exitCode();
        if (backendResult !== 0) {
          console.error("❌ Backend validations failed.");
          const stderr = await backendTest.stderr();
          console.error("Stderr output:", stderr);
          process.exit(1);
        }

        console.log("✅ All CI checks passed!");
      } catch (error) {
        console.error("❌ Dagger execution failed:", error);
        process.exit(1);
      }
    },
    { LogOutput: process.stdout }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
