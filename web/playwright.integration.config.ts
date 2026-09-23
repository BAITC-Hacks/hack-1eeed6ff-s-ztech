import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './integration', timeout: 30_000, workers: 1, fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/integration', open: 'never' }]],
  use: { baseURL: process.env.NEVERLOSE_BASE_URL ?? 'http://127.0.0.1:8000', browserName: 'chromium', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
