const { Then } = require('@cucumber/cucumber');
const { assertMatchesBaseline } = require('../../src/utils/baseline');
const { getPath } = require('../support/helpers');

/**
 * Compare the entire response body against a stored baseline JSON file.
 *   baselines/<env>/<name>.json
 */
Then('the response body should match the baseline {string}', function (name) {
  assertMatchesBaseline(this.responseBody, { name });
});

/**
 * Same as above, but with a list of dot-paths to ignore. Use `data[].field`
 * to ignore the same key across every array element.
 *
 *   And the response body should match the baseline "users" ignoring:
 *     | meta.requestId   |
 *     | meta.timestamp   |
 *     | data[].lastLogin |
 */
Then(
  'the response body should match the baseline {string} ignoring:',
  function (name, table) {
    const ignorePaths = table.raw().map((row) => row[0]);
    assertMatchesBaseline(this.responseBody, { name, ignorePaths });
  },
);

/**
 * Compare a sub-tree of the response (selected by a dot path) against a
 * baseline. Handy for endpoints that wrap data inside a `data` envelope.
 */
Then(
  'the response field {string} should match the baseline {string}',
  function (fieldPath, name) {
    const subset = getPath(this.responseBody, fieldPath);
    assertMatchesBaseline(subset, { name });
  },
);

Then(
  'the response field {string} should match the baseline {string} ignoring:',
  function (fieldPath, name, table) {
    const subset = getPath(this.responseBody, fieldPath);
    const ignorePaths = table.raw().map((row) => row[0]);
    assertMatchesBaseline(subset, { name, ignorePaths });
  },
);
