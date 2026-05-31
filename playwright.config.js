// @ts-check
// Playwright Test runner is used ONLY for offline unit tests of framework
// utilities (e.g. tests/unit/compare.spec.js). API feature tests run through
// Cucumber — see cucumber.js / features/.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/unit',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results/',
});
