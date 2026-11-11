import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests", use: { baseURL: "http://localhost:3000", headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }, workers: 1, timeout: 60000, reporter: "list", webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3000", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 30000 } });

