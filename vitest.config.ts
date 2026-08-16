import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The e2e test loads the real embedding model; the first run downloads it.
    testTimeout: 180_000,
  },
});
