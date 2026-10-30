import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  globalTimeout: 180_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5001", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: {
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--disable-gpu"],
    } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 5001",
    url: "http://127.0.0.1:5001",
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      APP_BASE_URL: "http://127.0.0.1:5001",
      APP_URL: "http://127.0.0.1:5001",
      SPOTIFY_REDIRECT_URI: "http://127.0.0.1:5001/api/auth/callback",
      SPOTIFY_CLIENT_ID: "browser-test-only",
      SPOTIFY_CLIENT_SECRET: "browser-test-only-not-a-real-secret",
    },
  },
});
