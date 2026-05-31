const { test, expect } = require('../../src/fixtures/apiFixture');
const { UsersApi } = require('../../src/api/endpoints/UsersApi');
const { assertMatchesBaseline } = require('../../src/utils/baseline');

test.describe('Users API - baseline comparison @baseline', () => {
  test('GET /v1/users matches stored baseline', async ({ api, env }) => {
    const users = new UsersApi(api);
    const resp = await users.list({ page: 1, pageSize: 10 });

    expect(resp.status(), 'expected 200 OK').toBe(200);
    const body = await resp.json();

    assertMatchesBaseline(body, {
      name: 'users-list-page1',
      ignorePaths: [
        'meta.requestId',
        'meta.timestamp',
        'data[].lastLoginAt',
      ],
    });

    test.info().annotations.push({ type: 'env', description: env.name });
  });
});
