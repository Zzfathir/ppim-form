import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const port = Number(process.env.E2E_PORT ?? 3001);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

/**
 * End-to-end tests against the dev server and the local Supabase stack
 * (`npm run db:start`). Reuses a dev server that's already running.
 */
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "phone-360",
      testMatch: /public-form\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 }, hasTouch: true },
    },
    { name: "desktop", testMatch: /(builder|responses)\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
