import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.smoke.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/unit/setup.ts"],
    testTimeout: 10_000,
    // Run tests sequentially to avoid DB constraint collisions
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    sequence: {
      concurrent: false,
    },
  },
});
