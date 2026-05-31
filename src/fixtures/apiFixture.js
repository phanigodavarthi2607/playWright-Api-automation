const base = require('@playwright/test');
const { ApiClient } = require('../api/ApiClient');
const { loadEnv } = require('../../config/env');

/**
 * Extends Playwright's `test` with:
 *   - env: the active environment config
 *   - api: an authenticated ApiClient (auto-disposed)
 *
 * Use in specs:
 *   const { test, expect } = require('../../src/fixtures/apiFixture');
 */
const test = base.test.extend({
  env: async ({}, use) => {
    await use(loadEnv());
  },
  api: async ({ env }, use) => {
    const client = await ApiClient.create(env);
    try {
      await use(client);
    } finally {
      await client.dispose();
    }
  },
});

module.exports = { test, expect: base.expect };
