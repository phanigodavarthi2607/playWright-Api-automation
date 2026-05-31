const { test, expect } = require('../../src/fixtures/apiFixture');
const { UsersApi } = require('../../src/api/endpoints/UsersApi');
const { DatabricksClient } = require('../../src/db/DatabricksClient');
const { SnowflakeClient } = require('../../src/db/SnowflakeClient');
const { assertApiMatchesDb } = require('../../src/db/dbCompare');

test.describe('Users API - DB validation @db', () => {
  test('GET /v1/users matches Databricks source-of-truth', async ({ api, env }) => {
    test.skip(!env.databricks.host, 'Databricks not configured for this env');

    const users = new UsersApi(api);
    const resp = await users.list({ page: 1, pageSize: 50 });
    expect(resp.status()).toBe(200);
    const body = await resp.json();

    const db = await DatabricksClient.connect();
    try {
      const rows = await db.query(`
        SELECT id, email, first_name, last_name, status
        FROM ${env.databricks.catalog}.${env.databricks.schema}.users
        ORDER BY id
        LIMIT 50
      `);

      assertApiMatchesDb(body.data, rows, {
        columnMap: { first_name: 'firstName', last_name: 'lastName' },
        ignoreKeys: ['lastLoginAt'],
        unordered: false,
      });
    } finally {
      await db.close();
    }
  });

  test('GET /v1/users matches Snowflake source-of-truth', async ({ api, env }) => {
    test.skip(!env.snowflake.account, 'Snowflake not configured for this env');

    const users = new UsersApi(api);
    const resp = await users.list({ page: 1, pageSize: 50 });
    expect(resp.status()).toBe(200);
    const body = await resp.json();

    const db = await SnowflakeClient.connect();
    try {
      const rows = await db.query(`
        SELECT ID, EMAIL, FIRST_NAME, LAST_NAME, STATUS
        FROM USERS
        ORDER BY ID
        LIMIT 50
      `);

      assertApiMatchesDb(body.data, rows, {
        columnMap: { first_name: 'firstName', last_name: 'lastName' },
        ignoreKeys: ['lastLoginAt'],
        unordered: false,
      });
    } finally {
      await db.close();
    }
  });
});
