import type { Config } from "tailwindcss";

const config: Config = {
  presets: [require("@citadel/tailwind-config")],
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
};
export default config;
