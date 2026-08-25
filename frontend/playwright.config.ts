import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const pythonCommand = process.env.PYTHON_BIN ?? "../backend/.venv/bin/python";
const localChrome = isCI ? {} : { channel: "chrome" as const };
const frontendPort = Number.parseInt(process.env.PLAYWRIGHT_FRONTEND_PORT ?? "55173", 10);
const backendPort = Number.parseInt(process.env.PLAYWRIGHT_BACKEND_PORT ?? "58000", 10);
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: frontendUrl,
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
      command: `${pythonCommand} ../backend/manage.py runserver 127.0.0.1:${backendPort} --noreload`,
      url: `${backendUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        USE_DEMO_PROVIDER: "true",
        CORS_ALLOWED_ORIGINS: frontendUrl,
      },
    },
    {
      command: `pnpm dev --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_BASE_URL: backendUrl,
      },
    },
  ],
});
