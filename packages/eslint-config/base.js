/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  parser: "@typescript-eslint/parser",
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  plugins: ["@typescript-eslint"],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    project: true,
  },
  env: { es2020: true },
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
  },
};
