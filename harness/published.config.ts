import { defineConfig } from '@playwright/test';
import { readConfig } from './config.ts';
const c = readConfig(process.env.O11_RUN_CONFIG!);
export default defineConfig({
  testDir: '.',
  testMatch: 'published.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180000 * c.playwright.viewports.length,
  reporter: 'list',
  outputDir: '../reports/' + process.env.O11_RUN_ID + '/playwright',
  use: { browserName: c.playwright.browser, headless: c.playwright.headless },
});
