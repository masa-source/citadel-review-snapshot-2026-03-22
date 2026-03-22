/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    "./base.js",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["react", "react-hooks"],
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    // React 17+ / automatic JSX transform
    "react/react-in-jsx-scope": "off",
    // PropTypes は TypeScript では不要
    "react/prop-types": "off",
  },
};
