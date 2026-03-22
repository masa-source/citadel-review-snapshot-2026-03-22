#!/usr/bin/env node
/**
 * Run ESLint from the correct package directory to avoid framework-specific ESLint plugin conflicts.
 * Usage: node scripts/lint-staged-eslint.js <scout|admin|types> [files...]
 * lint-staged passes the package key and files; we run eslint from that package's cwd.
 */
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const packageDirs = {
  scout: path.join(projectRoot, "apps", "scout"),
  admin: path.join(projectRoot, "apps", "admin"),
  types: path.join(projectRoot, "packages", "types"),
};

const pkg = process.argv[2];
if (!pkg || !packageDirs[pkg]) {
  process.exit(0);
}

const files = process.argv
  .slice(3)
  .filter(Boolean)
  .filter((f) => !f.includes("api.generated.ts"));
if (files.length === 0) {
  process.exit(0);
}

const dir = packageDirs[pkg];
const prefix = dir + path.sep;
const relativePaths = files.map((f) => {
  const absolute = path.isAbsolute(f) ? f : path.resolve(projectRoot, f);
  return path.relative(dir, absolute);
});

try {
  execSync("npx", ["eslint", "--fix", ...relativePaths], {
    stdio: "inherit",
    cwd: dir,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
