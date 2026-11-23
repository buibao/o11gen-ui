import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'integration',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: 'list',
  use: { browserName: 'chromium', headless: true },
});
