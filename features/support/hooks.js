const { Before, After, BeforeAll, Status } = require('@cucumber/cucumber');
const { ApiClient } = require('../../src/api/ApiClient');
const { logger } = require('../../src/utils/logger');

BeforeAll(function () {
  logger.info(`Cucumber run starting against TEST_ENV=${process.env.TEST_ENV || 'dev'}`);
});

/**
 * Build a fresh, authenticated ApiClient for every scenario so scenarios stay
 * independent. Login is cached at the AuthService layer, so we don't pay for
 * a real login each time.
 */
Before(async function () {
  this.api = await ApiClient.create(this.env);
});

After(async function () {
  if (this.api) {
    await this.api.dispose();
    this.api = null;
  }
});

/**
 * Tag-based skip hooks. Scenarios tagged @databricks or @snowflake are
 * skipped automatically when the required env vars are not configured —
 * which keeps the suite green on environments that don't have warehouse
 * access set up.
 */
Before({ tags: '@databricks' }, function () {
  if (!this.env.databricks.host) {
    return 'skipped';
  }
});

Before({ tags: '@snowflake' }, function () {
  if (!this.env.snowflake.account) {
    return 'skipped';
  }
});

/**
 * On failure, attach the last response (status + body) so the HTML report
 * shows what actually came back.
 */
After(async function ({ result }) {
  if (result && result.status === Status.FAILED && this.response) {
    try {
      const status = this.response.status();
      const body =
        typeof this.responseBody === 'string'
          ? this.responseBody
          : JSON.stringify(this.responseBody, null, 2);
      this.attach(
        `HTTP ${status}\n${body || '(empty body)'}`,
        'text/plain',
      );
    } catch {
      // best effort
    }
  }
});
