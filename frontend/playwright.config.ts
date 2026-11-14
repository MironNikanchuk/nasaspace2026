import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:3181",
    launchOptions: { executablePath: process.env.MOONSIGHT_TEST_CHROMIUM },
  },
  webServer: [
    {
      command: "uv run --directory ../backend --locked --python 3.12 uvicorn lunawindow.api:app --host 127.0.0.1 --port 3180",
      url: "http://127.0.0.1:3180/api/v1/health",
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3181",
      env: { LUNAWINDOW_API_URL: "http://127.0.0.1:3180" },
      url: "http://127.0.0.1:3181/api/lunar/health",
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3182",
      env: { LUNAWINDOW_API_URL: "http://127.0.0.1:3198" },
      url: "http://127.0.0.1:3182/api/lunar/health",
    },
  ],
});
