/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@citadel/tailwind-config")],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
};
