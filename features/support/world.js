const { setWorldConstructor, setDefaultTimeout, World } = require('@cucumber/cucumber');
const { loadEnv } = require('../../config/env');

/**
 * Per-scenario world. Holds:
 *   env          - active environment config (dev/uat/buat)
 *   api          - authenticated ApiClient (built in Before hook)
 *   request      - last request metadata { method, path, query, body }
 *   response     - last raw Playwright APIResponse
 *   responseBody - last response parsed as JSON (or text fallback)
 *   dbRows       - last warehouse query result
 *   scratch      - free-form store for sharing values between steps
 */
class ApiWorld extends World {
  constructor(options) {
    super(options);
    this.env = loadEnv();
    this.api = null;
    this.request = null;
    this.response = null;
    this.responseBody = null;
    this.dbRows = null;
    this.scratch = {};
  }
}

setWorldConstructor(ApiWorld);

// Generous default; individual steps still honour env.requestTimeoutMs.
setDefaultTimeout(60_000);

module.exports = { ApiWorld };
