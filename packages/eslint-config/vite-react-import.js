/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["./vite-react.js", "plugin:import/recommended", "plugin:import/typescript"],
  plugins: ["import"],
  rules: {
    "import/named": "error",
  },
};
