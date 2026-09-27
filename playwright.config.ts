import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config.
 *
 * The suite drives the real app against the real database, so it needs a
 * server. `pnpm dev` is reused when one is already up, which is the common
 * case locally; CI starts its own. No external service is contacted — every
 * scenario pays through the manual-transfer method, never Midtrans.
 */

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Scenarios share one database; running them in parallel would let one
  // test's sweep or stock assertion see another's rows.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // A dev server compiles each route on first hit; the first navigation of a
  // run can genuinely take tens of seconds.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
