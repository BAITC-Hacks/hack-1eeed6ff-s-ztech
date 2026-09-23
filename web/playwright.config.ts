import { defineConfig } from '@playwright/test';
export default defineConfig({
  projects: [{ name: 'light', use: { colorScheme: 'light' } }, { name: 'dark', use: { colorScheme: 'dark' } }],
  testDir: './e2e', timeout: 20_000, fullyParallel: false, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
