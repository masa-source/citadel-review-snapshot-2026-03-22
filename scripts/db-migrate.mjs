#!/usr/bin/env zx
import "zx/globals";
import path from "node:path";
import { ensureVenvPython, getProjectRoot, runProcess, runProcessCapture } from "./utils.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  let generate = false;
  let downgrade = false;
  let stamp = "";
  let message = "";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--generate" || arg === "-g") {
      generate = true;
    } else if (arg === "--downgrade" || arg === "-d") {
      downgrade = true;
    } else if (arg === "--stamp" || arg === "-s") {
      stamp = args[i + 1] ?? "";
      i += 1;
    } else if (arg === "--message" || arg === "-m") {
      message = args[i + 1] ?? "";
      i += 1;
    }
  }

  return { generate, downgrade, stamp, message };
}

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const backendDir = path.join(projectRoot, "apps", "backend");
  const venvPython = await ensureVenvPython(projectRoot);

  const { generate, downgrade, stamp, message } = parseArgs();

  console.log("=== Database Migration ===");
  console.log();

  try {
    if (generate) {
      if (!message) {
        console.error("Error: --message is required with --generate");
        console.error(
          "Usage: zx scripts/db-migrate.mjs --generate --message 'your_migration_message'"
        );
        process.exit(1);
      }
      console.log(`Generating new migration: ${message}`);
      await runProcess(venvPython, ["-m", "alembic", "revision", "--autogenerate", "-m", message], {
        cwd: backendDir,
      });
    } else if (stamp) {
      console.log(`Stamping database as revision: ${stamp}`);
      await runProcess(venvPython, ["-m", "alembic", "stamp", stamp], { cwd: backendDir });
    } else if (downgrade) {
      console.log("Downgrading to previous revision...");
      await runProcess(venvPython, ["-m", "alembic", "downgrade", "-1"], { cwd: backendDir });
    } else {
      console.log("Applying pending migrations...");
      const upgradeResult = await runProcessCapture(venvPython, ["-m", "alembic", "upgrade", "head"], {
        cwd: backendDir,
      });
      if (upgradeResult.stdout) process.stdout.write(upgradeResult.stdout);
      if (upgradeResult.stderr) process.stderr.write(upgradeResult.stderr);

      if (upgradeResult.code !== 0) {
        const stderr = upgradeResult.stderr || "";
        const isSchemaSyncIssue =
          stderr.includes("DuplicateTable") || stderr.includes("already exists");
        if (isSchemaSyncIssue) {
          console.log();
          console.log(
            "[INFO] Upgrade failed (schema already exists). Attempting recovery (stamp + upgrade)..."
          );
          const revisionBeforeRoleKey = "e7f8a9b0c1d2";
          await runProcess(venvPython, ["-m", "alembic", "stamp", revisionBeforeRoleKey], {
            cwd: backendDir,
          });
          await runProcess(venvPython, ["-m", "alembic", "upgrade", "head"], {
            cwd: backendDir,
          });
        } else {
          throw new Error(
            `Process failed: python -m alembic upgrade head (exit code ${upgradeResult.code})`
          );
        }
      }
    }

    console.log();
    console.log("Current version:");
    await runProcess(venvPython, ["-m", "alembic", "current"], { cwd: backendDir });
  } catch (err) {
    console.error();
    console.error("Migration failed!");
    console.error(err);
    console.error("");
    const msg = String(err);
    if (
      msg.includes("Connection refused") ||
      msg.includes("5432") ||
      msg.includes("OperationalError")
    ) {
      console.error("PostgreSQL may not be running. Start it first: pnpm db:up");
      console.error("");
    }
    console.error(
      'If the error is "already exists" or DuplicateTable, the DB may already have the schema.'
    );
    console.error(
      "  To mark current state as applied: pnpm db:migrate --stamp head"
    );
    console.error("  To reset the DB and re-run migrations: pnpm db:reset");
    process.exit(1);
  }

  console.log();
  console.log("=== Done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
