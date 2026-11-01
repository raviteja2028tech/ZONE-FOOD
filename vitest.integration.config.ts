import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests: need the Docker databases from Part 1 to be running (`docker compose up -d --wait`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests-web/stubs/server-only.ts", import.meta.url)) } },
  test: {
    include: ["tests-web/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 240000,
    fileParallelism: false,
    globalSetup: ["tests-web/integration/global-setup.ts"],
    setupFiles: ["tests-web/integration/setup-env.ts"],
  },
});
