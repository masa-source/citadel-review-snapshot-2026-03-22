#!/usr/bin/env zx
import "zx/globals";
import path from "node:path";
import { ensureVenvPython, getProjectRoot, getPnpmPath, runProcess } from "./utils.mjs";

async function main() {
  const projectRoot = getProjectRoot(import.meta.url);
  const backendDir = path.join(projectRoot, "apps", "backend");
  const typesDir = path.join(projectRoot, "packages", "types");
  const venvPython = await ensureVenvPython(projectRoot);
  const pnpmBin = getPnpmPath(projectRoot);

  const generateValidationScript = path.join(projectRoot, "scripts", "generate-validation.mjs");

  console.log("=== Generate TypeScript Types ===");
  console.log();

  // Step 1: Generate validation constants from SSOT
  console.log("[1/5] Generating validation constants...");
  try {
    await runProcess(process.execPath, [generateValidationScript], { cwd: projectRoot });
    console.log("  Done");
  } catch (err) {
    console.error("  Failed");
    console.error(err);
    process.exit(1);
  }

  // Step 1.5: Generate schema constants from metadata JSON
  console.log("[2/5] Generating schema constants and definitions...");
  const generateSchemaScript = path.join(projectRoot, "scripts", "generate-schema.mjs");
  try {
    await runProcess(process.execPath, [generateSchemaScript], { cwd: projectRoot });
    console.log("  Done");
  } catch (err) {
    console.error("  Failed");
    console.error(err);
    process.exit(1);
  }

  // Step 2: Export OpenAPI schema (uses the freshly generated validation.py)
  console.log("[2/4] Exporting OpenAPI schema...");
  try {
    const env = { PYTHONPATH: "." };
    await runProcess(venvPython, ["scripts/export_openapi.py"], { cwd: backendDir, env });
    console.log("  Done");
  } catch (err) {
    console.error("  Failed");
    console.error(err);
    console.error("");
    console.error(
      "If you see ModuleNotFoundError above, install backend deps: pip install -r apps/backend/requirements.txt"
    );
    process.exit(1);
  }

  // Step 3: Generate TypeScript types from OpenAPI
  console.log("[3/4] Generating TypeScript types...");
  try {
    await runProcess(pnpmBin, ["generate"], { cwd: typesDir });
    console.log("  Done");
  } catch (err) {
    console.error("  Failed");
    console.error(err);
    process.exit(1);
  }

  // Step 4: Build types package
  console.log("[4/4] Building types package...");
  try {
    await runProcess(pnpmBin, ["build"], { cwd: typesDir });
    console.log("  Done");
  } catch (err) {
    console.error("  Failed");
    console.error(err);
    process.exit(1);
  }

  console.log();
  console.log("=== Type Generation Complete ===");
  console.log();
  console.log("Generated files:");
  console.log("  - apps/backend/config/validation.py  (from shared/validation-rules.json)");
  console.log(
    "  - packages/types/src/validation-rules.generated.ts  (from shared/validation-rules.json)"
  );
  console.log("  - apps/backend/openapi.json");
  console.log("  - packages/types/src/api.generated.ts");
  console.log("  - packages/types/dist/");
  console.log();
  console.log("Commit generated files before pushing.");
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
