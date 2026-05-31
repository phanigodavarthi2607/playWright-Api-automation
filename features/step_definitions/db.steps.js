const { When, Then } = require('@cucumber/cucumber');
const { DatabricksClient } = require('../../src/db/DatabricksClient');
const { SnowflakeClient } = require('../../src/db/SnowflakeClient');
const { assertApiMatchesDb } = require('../../src/db/dbCompare');
const { getPath } = require('../support/helpers');

async function runQuery(ClientCtor, sql) {
  const db = await ClientCtor.connect();
  try {
    return await db.query(sql);
  } finally {
    await db.close();
  }
}

/* ---------------------------------------------------------------- */
/* DB query steps                                                    */
/* ---------------------------------------------------------------- */

/**
 * Run a Databricks SQL query and stash the rows on the world for the
 * following Then-step. Use with a Gherkin doc-string:
 *
 *   When I query Databricks:
 *     """
 *     SELECT id, email FROM users ORDER BY id LIMIT 50
 *     """
 */
When('I query Databricks:', async function (sql) {
  this.dbRows = await runQuery(DatabricksClient, sql);
});

When('I query Snowflake:', async function (sql) {
  this.dbRows = await runQuery(SnowflakeClient, sql);
});

/* ---------------------------------------------------------------- */
/* Comparison steps                                                  */
/* ---------------------------------------------------------------- */

/**
 * Compare the API response (or a sub-field) against the rows from the
 * most recent DB query. Column names are normalised to lowercase before
 * comparison.
 */
Then('the response field {string} should match the DB rows', function (fieldPath) {
  const apiRows = getPath(this.responseBody, fieldPath);
  assertApiMatchesDb(apiRows, this.dbRows);
});

Then('the response should match the DB rows', function () {
  assertApiMatchesDb(this.responseBody, this.dbRows);
});

/**
 * Same as the previous step but with an explicit DB-column -> API-field
 * rename map. Useful when the warehouse uses SNAKE_CASE and the API uses
 * camelCase:
 *
 *   And the response field "data" should match the DB rows with mapping:
 *     | first_name | firstName |
 *     | last_name  | lastName  |
 */
Then(
  'the response field {string} should match the DB rows with mapping:',
  function (fieldPath, table) {
    const apiRows = getPath(this.responseBody, fieldPath);
    const columnMap = Object.fromEntries(table.raw());
    assertApiMatchesDb(apiRows, this.dbRows, { columnMap });
  },
);

Then(
  'the response field {string} should match the DB rows ignoring:',
  function (fieldPath, table) {
    const apiRows = getPath(this.responseBody, fieldPath);
    const ignoreKeys = table.raw().map((row) => row[0]);
    assertApiMatchesDb(apiRows, this.dbRows, { ignoreKeys });
  },
);

Then('the DB query should return {int} rows', function (n) {
  if (!Array.isArray(this.dbRows)) {
    throw new Error('No DB query has been executed in this scenario.');
  }
  if (this.dbRows.length !== n) {
    throw new Error(`Expected ${n} DB rows, got ${this.dbRows.length}.`);
  }
});
