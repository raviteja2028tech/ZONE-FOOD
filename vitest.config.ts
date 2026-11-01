import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests: pure logic only, no databases required.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests-web/stubs/server-only.ts", import.meta.url)) } },
  test: { include: ["tests-web/unit/**/*.test.ts"], environment: "node" },
});
