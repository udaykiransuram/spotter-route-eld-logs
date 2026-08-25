import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const pythonCommand = process.env.PYTHON_BIN ?? "../backend/.venv/bin/python";
const localChrome = isCI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], ...localChrome },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], ...localChrome },
    },
  ],
  webServer: [
    {
      command: `${pythonCommand} ../backend/manage.py runserver 127.0.0.1:8000 --noreload`,
      url: "http://127.0.0.1:8000/api/v1/health",
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        USE_DEMO_PROVIDER: "true",
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      },
    },
    {
      command: "pnpm dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
