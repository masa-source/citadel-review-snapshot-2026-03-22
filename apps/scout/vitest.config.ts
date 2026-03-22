import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
      testTimeout: 30000,
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      coverage: {
        reporter: ["text", "json", "html", "cobertura"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.d.ts", "src/**/types/**", "src/test/**"],
        thresholds: {
          statements: 20,
          branches: 20,
          functions: 20,
          lines: 20,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@citadel/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
        "@citadel/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
        "@citadel/monitoring": path.resolve(__dirname, "../../packages/monitoring/src/index.ts"),
      },
    },
  })
);
