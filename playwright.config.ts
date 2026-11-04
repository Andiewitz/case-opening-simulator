import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks for the parts unit tests cannot see: the reel animation
 * (docs/plan-hardening.md H4) and the SPA's own routing.
 *
 * Two servers are started for a run:
 *   - a stub API on 4319, so no AWS credentials or network are involved;
 *   - the built app on 4301, with VITE_API_BASE_URL pointed at the stub.
 * The app is rebuilt for every run because Vite bakes env vars at build time.
 */
const STUB_PORT = 4319;
const APP_PORT = 4301;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/stub-server.mjs",
      port: STUB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      command:
        `VITE_API_BASE_URL=http://127.0.0.1:${STUB_PORT} vite build --outDir dist-e2e --emptyOutDir >/dev/null && ` +
        `vite preview --outDir dist-e2e --port ${APP_PORT} --strictPort --host 127.0.0.1`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
