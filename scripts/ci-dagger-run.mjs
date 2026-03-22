/**
 * Dagger を用いたローカル CI (ESM JS 高速キャッシュ版)
 */
import { connect, ReturnType } from "@dagger.io/dagger";
import fs from "node:fs";

async function main() {
  console.log("🚀 Starting Dagger Local CI (Fast Mode)...");

  await connect(
    async (client) => {
      try {
        console.log("📦 Preparing source and cache volumes...");
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
          "**/*.py",
          "**/requirements.txt",
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

        let nodeBase = client
          .container()
          .from("node:20")
          .withWorkdir("/src")
          .withEnvVariable("CI", "true")
          .withEnvVariable("PNPM_HOME", "/root/.local/share/pnpm")
          .withExec(["apt-get", "update"])
          .withExec(["apt-get", "install", "-y", "git", "python3", "python3-pip"])
          .withExec(["corepack", "enable"])
          .withMountedCache("/root/.local/share/pnpm/store", pnpmStore);

        const rootFiles = [
          "package.json",
          "pnpm-lock.yaml",
          "pnpm-workspace.yaml",
          "turbo.json",
          ".prettierrc",
          ".prettierignore",
          "knip.json",
          "playwright.config.ts",
        ];
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
          .withMountedCache("/root/.cache/pip", pipCache)
          .withExec(["pip3", "install", "ruff", "--break-system-packages"])
          .withExec([
            "pip3",
            "install",
            "-r",
            "apps/backend/requirements.txt",
            "--break-system-packages",
          ])
          .withExec(["pnpm", "install", "--frozen-lockfile"]);

        const postgresSvc = client
          .container()
          .from("postgres:15-alpine")
          .withEnvVariable("POSTGRES_USER", "citadel")
          .withEnvVariable("POSTGRES_PASSWORD", "citadel")
          .withEnvVariable("POSTGRES_DB", "citadel")
          .withExposedPort(5432)
          .asService({ useEntrypoint: true });

        const results = {};

        // --- ステップ 1: 静的解析 & 同期チェック ---
        console.log("🔍 Running Static Analysis & Sync Checks...");
        const staticAnalysis = nodeBase
          .withExec([
            "pnpm",
            "exec",
            "prettier",
            "--check",
            "apps/**/*.{ts,tsx}",
            "packages/**/*.{ts,tsx}",
          ])
          .withExec(["node", "scripts/generate-validation.mjs", "--check"])
          .withExec(["node", "scripts/generate-schema.mjs", "--check"])
          .withExec(["cp", "packages/types/src/api.generated.ts", "/tmp/api.generated.ts.orig"])
          .withExec(["node", "scripts/generate-types.mjs"])
          .withExec(["diff", "packages/types/src/api.generated.ts", "/tmp/api.generated.ts.orig"]);
        results.staticAnalysis = await staticAnalysis.exitCode();

        // --- ステップ 2: フロントエンド検証 (Lint, Build) ---
        console.log("🧪 Running Frontend Lint & Build...");
        const frontendBuild = nodeBase.withExec(["pnpm", "turbo", "run", "lint", "build"]);
        results.frontendBuild = await frontendBuild.exitCode();

        // --- ステップ 3: フロントエンドテスト (Vitest) ---
        console.log("🧪 Running Frontend Tests...");
        const frontendTest = nodeBase.withExec([
          "pnpm",
          "turbo",
          "run",
          "test:coverage",
          "--",
          "--run",
        ]);
        results.frontendTest = await frontendTest.exitCode();

        // --- ステップ 4: バックエンド検証 (Lint, Migration, Test) ---
        console.log("🐍 Running Backend Validation...");
        const backendValidation = client
          .container()
          .from("python:3.11-slim")
          .withServiceBinding("db", postgresSvc)
          .withMountedDirectory("/src/apps/backend", backendDir)
          .withMountedDirectory("/src/shared", sharedDir)
          .withMountedFile("/src/package.json", client.host().file("package.json"))
          .withWorkdir("/src/apps/backend")
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
            "testcontainers[postgres]",
            "polyfactory",
          ])
          .withExec(["sh", "-c", "until pg_isready -h db -p 5432 -U citadel; do sleep 1; done"])
          .withExec(["ruff", "check", "."])
          .withExec(["sh", "-c", "python -m alembic upgrade head && python -m alembic current && python -m alembic downgrade -1 && python -m alembic upgrade head"])
          .withExec(
            [
              "python",
              "-m",
              "pytest",
              "-n",
              "auto",
              "-m",
              "not ai_eval",
              "--cov=services",
              "--cov-fail-under=70",
              "-v",
            ],
            { expect: ReturnType.Any }
          );
        results.backendValidation = await backendValidation.exitCode();
        if (results.backendValidation !== 0) {
          console.error("backendValidation STDOUT:\n", await backendValidation.stdout());
          console.error("backendValidation STDERR:\n", await backendValidation.stderr());
        }

        // --- ステップ 5: E2E ビルド確認 (注意: ci:local ではテスト自体は実行しない) ---
        console.log("🏗️  Verifying E2E Builds...");
        const e2eBuildCheck = nodeBase.withExec([
          "pnpm",
          "turbo",
          "run",
          "build",
          "--filter=@citadel/scout...",
          "--filter=@citadel/admin...",
        ]);
        results.e2eBuild = await e2eBuildCheck.exitCode();

        console.log("\n📊 CI Results Summary:");
        console.table(results);

        if (Object.values(results).some((code) => code !== 0)) {
          process.exit(1);
        }
        console.log("✅ All CI checks passed (Locally Reproduced GHA)!");
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
