/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("./base.js"),
  root: true,
  ignorePatterns: ["dist/**", "node_modules/**"],
};
