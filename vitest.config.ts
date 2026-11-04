import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom for the auth/browser tests; the backend tests run fine in it too
    // because node builtins (zlib, fs) remain available.
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
