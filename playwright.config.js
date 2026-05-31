// @ts-check
const { defineConfig } = require('@playwright/test');
const { loadEnv } = require('./config/env');

const env = loadEnv();

module.exports = defineConfig({
  testDir: './tests',
  timeout: env.requestTimeoutMs * 2,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : env.retryCount,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
  ],
  use: {
    baseURL: env.apiBaseUrl,
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: `api-${env.name}`,
      testMatch: /.*\.spec\.js/,
    },
  ],
  outputDir: 'test-results/',
});
