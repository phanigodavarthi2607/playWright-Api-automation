import { defineConfig, devices } from '@playwright/test';
import config, { ENV } from './src/core/config.js';

const reportDir = config.paths.reports;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: config.playwright.retries,
  workers: config.playwright.workers,
  timeout: config.playwright.timeout,
  expect: { timeout: 10_000 },

  reporter: [
    ['html', { outputFolder: `${reportDir}/html`, open: 'never' }],
    ['json', { outputFile: `${reportDir}/results.json` }],
    ['list'],
  ],

  use: {
    baseURL: config.app.baseUrl,
    trace: config.isProd() ? 'off' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: config.isProd() ? 'off' : 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: config.isProd() ? 60_000 : 30_000,
  },

  metadata: {
    environment: ENV,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: config.app.apiBaseUrl },
    },
    {
      name: 'data',
      testDir: './tests/data',
      timeout: 120_000,
    },
  ],
});
