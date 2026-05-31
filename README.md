# Playwright API Automation (JavaScript)

A pure-JavaScript Playwright framework for **API testing** that supports:

- Multiple environments (`dev`, `uat`, `buat`) via per-env `.env` files
- **SiteMinder (SM_SESSION)** authentication via a separate login API
- Two validation strategies per test:
  1. **Baseline (snapshot)** comparison against a stored JSON file
  2. **Live comparison** against rows from **Databricks** or **Snowflake**

No TypeScript, no build step. Run `npm test` and you're going.

---

## 1. Project layout

```
.
├── config/
│   └── env.js                  # loads .env.<env> & validates required vars
├── src/
│   ├── api/
│   │   ├── AuthService.js      # SM_SESSION login + caching
│   │   ├── ApiClient.js        # authed wrapper around APIRequestContext
│   │   └── endpoints/
│   │       └── UsersApi.js     # example endpoint wrapper
│   ├── db/
│   │   ├── DatabricksClient.js # lazy @databricks/sql wrapper
│   │   ├── SnowflakeClient.js  # lazy snowflake-sdk wrapper
│   │   └── dbCompare.js        # API <-> DB row comparison
│   ├── fixtures/
│   │   └── apiFixture.js       # `test`/`expect` w/ authed `api` fixture
│   └── utils/
│       ├── compare.js          # deepDiff with ignorePaths/unordered
│       ├── baseline.js         # write/read/compare baseline JSON
│       └── logger.js
├── baselines/                  # generated/per-env snapshot files
├── tests/
│   ├── api/
│   │   ├── users.baseline.spec.js
│   │   └── users.db.spec.js
│   └── unit/
│       └── compare.spec.js     # offline self-tests for the diff util
├── playwright.config.js
├── package.json
└── .env.example
```

---

## 2. Setup

```bash
npm install
cp .env.example .env.dev
cp .env.example .env.uat
cp .env.example .env.buat
```

Edit each `.env.<env>` and set `API_BASE_URL`, `AUTH_BASE_URL`, credentials
(or a pre-issued `SM_SESSION`), and optionally Databricks/Snowflake creds.

> The Databricks and Snowflake SDKs are listed as **optionalDependencies**.
> Install only the one(s) you need:
>
> ```bash
> npm install @databricks/sql        # Databricks tests
> npm install snowflake-sdk          # Snowflake tests
> ```

---

## 3. Environments

The active env is chosen via `TEST_ENV`:

| Command            | Env loaded |
| ------------------ | ---------- |
| `npm run test:dev` | `dev`      |
| `npm run test:uat` | `uat`      |
| `npm run test:buat`| `buat`     |
| `npm test`         | defaults to `dev` |

`config/env.js` reads `.env.<TEST_ENV>` automatically and throws a clear
error if a required variable is missing.

---

## 4. Authentication (SM_SESSION)

`AuthService` handles two flows transparently:

1. **Use a pre-issued token** — set `SM_SESSION=...` in your `.env.<env>`
   file. The login API is skipped entirely.
2. **Real login** — leave `SM_SESSION` blank and set `AUTH_USERNAME`,
   `AUTH_PASSWORD`, and `AUTH_LOGIN_PATH`. The service `POST`s the
   credentials to `AUTH_BASE_URL + AUTH_LOGIN_PATH` and extracts
   `SMSESSION` from either the `Set-Cookie` header or the JSON body.

The token is cached for the whole test run, and every request made through
`ApiClient` automatically carries `Cookie: SMSESSION=<token>`.

---

## 5. Writing a test

```js
const { test, expect } = require('../../src/fixtures/apiFixture');
const { UsersApi } = require('../../src/api/endpoints/UsersApi');

test('GET /v1/users returns 200', async ({ api }) => {
  const resp = await new UsersApi(api).list({ page: 1, pageSize: 10 });
  expect(resp.status()).toBe(200);
});
```

The `api` fixture is already authenticated and tied to the active env.

---

## 6. Validation strategy A — Baseline (snapshot) comparison

```js
const { assertMatchesBaseline } = require('../../src/utils/baseline');

const body = await resp.json();
assertMatchesBaseline(body, {
  name: 'users-list-page1',
  ignorePaths: [
    'meta.requestId',
    'meta.timestamp',
    'data[].lastLoginAt',
  ],
});
```

- Baselines live under `baselines/<env>/<name>.json` (or
  `baselines/shared/...` if `shared: true` is passed).
- The first run for a baseline **auto-creates** the file. Commit it.
- To intentionally refresh baselines:

  ```bash
  npm run baseline:update
  # which is: cross-env TEST_ENV=dev UPDATE_BASELINES=true playwright test --grep @baseline
  ```

- `ignorePaths` supports `[]` as an "any array index" wildcard
  (`data[].id` ignores `data[0].id`, `data[1].id`, …).

---

## 7. Validation strategy B — Compare API vs Databricks / Snowflake

```js
const { DatabricksClient } = require('../../src/db/DatabricksClient');
const { assertApiMatchesDb } = require('../../src/db/dbCompare');

const resp = await api.get('/v1/users');
const body = await resp.json();

const db = await DatabricksClient.connect();
try {
  const rows = await db.query(`SELECT id, email, first_name, last_name FROM ...`);
  assertApiMatchesDb(body.data, rows, {
    columnMap: { first_name: 'firstName', last_name: 'lastName' },
    ignoreKeys: ['lastLoginAt'],
    unordered: false,
  });
} finally {
  await db.close();
}
```

`SnowflakeClient` exposes the exact same API. The framework lowercases
warehouse column names and applies `columnMap` so SNAKE_CASE columns line up
with camelCase JSON fields automatically.

---

## 8. NPM scripts

| Script                    | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `npm test`                | Run all tests against `dev`                      |
| `npm run test:dev`        | Run against `dev`                                |
| `npm run test:uat`        | Run against `uat`                                |
| `npm run test:buat`       | Run against `buat`                               |
| `npm run test:baseline`   | Only `@baseline` tagged tests                    |
| `npm run test:db`         | Only `@db` tagged tests                          |
| `npm run baseline:update` | Refresh stored baseline files                    |
| `npm run report`          | Open the last Playwright HTML report             |
| `npm run lint`            | Run eslint over the framework                    |

---

## 9. Tagging convention

Tests use Playwright's `--grep` against tags in `describe`/`test` titles:

- `@baseline` — snapshot comparison tests
- `@db`       — Databricks/Snowflake comparison tests
- `@unit`     — offline tests for framework utilities

---

## 10. CI

The framework writes three reports out of the box:

- `playwright-report/index.html` — HTML report
- `test-results/results.xml`     — JUnit XML (consumable by Jenkins/GitLab)
- Stdout `list` reporter         — concise per-test status

Set `CI=true` (most CI systems do this automatically) to enable
`forbidOnly`, 2 retries, and 4 workers.
