import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Temporary: no specs exist yet. Removed in S3 so a broken glob can never
    // pass silently once there are real tests to find.
    passWithNoTests: true,
    // The e2e test loads the real embedding model; the first run downloads it.
    testTimeout: 180_000,
  },
});
