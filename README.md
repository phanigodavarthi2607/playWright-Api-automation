# Playwright + Cucumber API Automation (JavaScript)

A pure-JavaScript **BDD** API automation framework that uses:

- **Cucumber** (`@cucumber/cucumber`) as the test runner / DSL
- **Playwright**'s `APIRequestContext` as the HTTP engine

It supports:

- Multiple environments (`dev`, `uat`, `buat`) via per-env `.env` files
- **SiteMinder (SM_SESSION)** authentication via a separate login API
- Two validation strategies, both expressed as natural-language Gherkin steps:
  1. **Baseline (snapshot)** comparison against a stored JSON file
  2. **Live comparison** against rows from **Databricks** or **Snowflake**

No TypeScript, no build step. Run `npm test` and you're going.

---

## 1. Project layout

```
.
├── cucumber.js                        # cucumber profiles (default, dev, uat, buat, baseline, db, smoke, ci)
├── playwright.config.js               # Playwright Test runner — used only for offline unit tests
├── config/
│   └── env.js                         # loads .env.<env> & validates required vars
├── src/                               # framework engine (re-used by Cucumber)
│   ├── api/
│   │   ├── AuthService.js             # SM_SESSION login + caching
│   │   ├── ApiClient.js               # authed wrapper around APIRequestContext
│   │   └── endpoints/UsersApi.js      # optional: typed endpoint wrappers
│   ├── db/
│   │   ├── DatabricksClient.js        # lazy @databricks/sql wrapper
│   │   ├── SnowflakeClient.js         # lazy snowflake-sdk wrapper
│   │   └── dbCompare.js               # API <-> DB row comparison
│   └── utils/
│       ├── compare.js                 # deepDiff with ignorePaths/unordered
│       ├── baseline.js                # write/read/compare baseline JSON
│       └── logger.js
├── features/                          # BDD layer
│   ├── api/
│   │   ├── users-baseline.feature     # @baseline scenarios
│   │   └── users-db.feature           # @db scenarios
│   ├── step_definitions/
│   │   ├── common.steps.js            # HTTP verb steps + response assertions
│   │   ├── baseline.steps.js          # baseline comparison steps
│   │   └── db.steps.js                # Databricks / Snowflake comparison steps
│   └── support/
│       ├── world.js                   # custom World (env, api, response, dbRows, scratch)
│       ├── hooks.js                   # Before/After + @databricks/@snowflake skip hooks
│       └── helpers.js                 # getPath, tableToObject, maybeJson
├── baselines/                         # per-env snapshot files (commit them)
├── tests/
│   └── unit/compare.spec.js           # offline self-tests for the diff util
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

> Databricks and Snowflake SDKs are listed as **optionalDependencies**.
> Install only the one(s) you need:
>
> ```bash
> npm install @databricks/sql        # for @databricks scenarios
> npm install snowflake-sdk          # for @snowflake scenarios
> ```

---

## 3. Environments

The active env is chosen via `TEST_ENV`, applied by the npm scripts:

| Command            | TEST_ENV | Profile |
| ------------------ | -------- | ------- |
| `npm run test:dev` | `dev`    | `dev`   |
| `npm run test:uat` | `uat`    | `uat`   |
| `npm run test:buat`| `buat`   | `buat`  |
| `npm test`         | `dev`    | default |

`config/env.js` reads `.env.<TEST_ENV>` automatically and throws a clear
error if a required variable is missing.

---

## 4. Authentication (SM_SESSION)

`AuthService` handles two flows transparently — same as before:

1. **Pre-issued token** — set `SM_SESSION=...` in your `.env.<env>` file;
   the login API call is skipped.
2. **Real login** — leave `SM_SESSION` blank and set `AUTH_USERNAME`,
   `AUTH_PASSWORD`, and `AUTH_LOGIN_PATH`. The service `POST`s the
   credentials to `AUTH_BASE_URL + AUTH_LOGIN_PATH` and extracts
   `SMSESSION` from either the `Set-Cookie` header or the JSON body.

The token is cached for the whole Cucumber run, and every request made
through `ApiClient` (which the Before hook constructs and the World
exposes as `this.api`) automatically carries `Cookie: SMSESSION=<token>`.

---

## 5. Writing a feature

```gherkin
@users
Feature: Users API basic checks
  Background:
    Given I am authenticated

  Scenario: GET /v1/users returns 200
    When I send a GET request to "/v1/users" with query:
      | page     | 1  |
      | pageSize | 10 |
    Then the response status should be 200
    And the response field "data" should exist
```

You don't need to write any glue code — the steps above are already
implemented by `features/step_definitions/common.steps.js`.

### Built-in step catalogue

#### Auth / environment
- `Given I am authenticated`
- `Given the test runs against the "<env>" environment`

#### Request
- `When I send a <METHOD> request to "<path>"`
- `When I send a <METHOD> request to "<path>" with query:` *(table)*
- `When I send a <METHOD> request to "<path>" with body:` *(doc-string)*
- `When I send a <METHOD> request to "<path>" with headers:` *(table)*
- `When I save the response field "<path>" as "<key>"`

#### Response assertions
- `Then the response status should be <int>`
- `Then the response status should be one of "<csv>"`
- `Then the response should have header "<name>"`
- `Then the response field "<path>" should equal "<value>"`
- `Then the response field "<path>" should exist`
- `Then the response field "<path>" should have <int> items`

#### Baseline (snapshot) comparison
- `Then the response body should match the baseline "<name>"`
- `Then the response body should match the baseline "<name>" ignoring:` *(table of dot-paths)*
- `Then the response field "<path>" should match the baseline "<name>"`
- `Then the response field "<path>" should match the baseline "<name>" ignoring:` *(table)*

#### DB validation
- `When I query Databricks:` *(doc-string SQL)*
- `When I query Snowflake:` *(doc-string SQL)*
- `Then the response field "<path>" should match the DB rows`
- `Then the response should match the DB rows`
- `Then the response field "<path>" should match the DB rows with mapping:` *(table)*
- `Then the response field "<path>" should match the DB rows ignoring:` *(table)*
- `Then the DB query should return <int> rows`

---

## 6. Validation strategy A — Baseline (snapshot) comparison

```gherkin
@baseline
Scenario: Users list matches stored baseline
  When I send a GET request to "/v1/users" with query:
    | page     | 1  |
    | pageSize | 10 |
  Then the response status should be 200
  And the response body should match the baseline "users-list-page1" ignoring:
    | meta.requestId     |
    | meta.timestamp     |
    | data[].lastLoginAt |
```

- Baselines live under `baselines/<env>/<name>.json` (or
  `baselines/shared/...` when `shared: true` is passed in the helper).
- The first run for a baseline **auto-creates** the file. Commit it.
- To intentionally refresh baselines:

  ```bash
  npm run baseline:update
  # => cross-env TEST_ENV=dev UPDATE_BASELINES=true cucumber-js --profile baseline
  ```

- `ignorePaths` supports `[]` as an "any array index" wildcard
  (`data[].id` ignores `data[0].id`, `data[1].id`, …).

---

## 7. Validation strategy B — Compare API vs Databricks / Snowflake

```gherkin
@db @databricks
Scenario: Users list matches Databricks
  When I send a GET request to "/v1/users" with query:
    | page     | 1  |
    | pageSize | 50 |
  And I query Databricks:
    """
    SELECT id, email, first_name, last_name, status
    FROM users
    ORDER BY id
    LIMIT 50
    """
  Then the response status should be 200
  And the response field "data" should match the DB rows with mapping:
    | first_name | firstName |
    | last_name  | lastName  |
```

- Replace `Databricks` with `Snowflake` for Snowflake — every other step is identical.
- Scenarios tagged `@databricks` or `@snowflake` are **auto-skipped** when
  the corresponding env vars aren't configured (see `features/support/hooks.js`).
- DB column names are lowercased before comparison; use the mapping table
  to align SNAKE_CASE columns with camelCase API fields.

---

## 8. NPM scripts

| Script                    | What it runs                                     |
| ------------------------- | ------------------------------------------------ |
| `npm test`                | All features against `dev`                       |
| `npm run test:dev`        | All features, `dev` profile                      |
| `npm run test:uat`        | All features, `uat` profile                      |
| `npm run test:buat`       | All features, `buat` profile                     |
| `npm run test:baseline`   | Only `@baseline`-tagged scenarios                |
| `npm run test:db`         | Only `@db`-tagged scenarios                      |
| `npm run test:smoke`      | Only `@smoke`-tagged scenarios                   |
| `npm run test:tag -- '@users and not @db'` | Free-form tag expression          |
| `npm run test:dry`        | Cucumber dry-run (validates step bindings)       |
| `npm run test:ci`         | `ci` profile (parallel + JUnit + retries)        |
| `npm run test:unit`       | Offline unit tests via Playwright Test           |
| `npm run baseline:update` | Refresh stored baseline files                    |
| `npm run report`          | HTML report path (`cucumber-report/...html`)     |
| `npm run lint`            | ESLint over the whole framework                  |

---

## 9. Tagging convention

| Tag           | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `@baseline`   | Snapshot comparison scenarios                                 |
| `@db`         | Warehouse comparison scenarios                                |
| `@databricks` | Requires Databricks env vars (auto-skipped if missing)        |
| `@snowflake`  | Requires Snowflake env vars (auto-skipped if missing)         |
| `@smoke`      | Critical-path subset                                          |
| `@users`      | Feature/area tag — extend as you add suites                   |

Combine them freely:

```bash
npm run test:tag -- '@users and @baseline'
npm run test:tag -- 'not @db'
```

---

## 10. Reports

Out of the box the runner writes:

- `cucumber-report/cucumber-report.html`  — HTML report (open in a browser)
- `cucumber-report/cucumber-report.json`  — JSON results (for custom dashboards)
- `cucumber-report/cucumber-report.xml`   — JUnit XML (CI), only on the `ci` profile

`CI=true` enables `forbidOnly` on the Playwright unit suite. Use
`npm run test:ci` for parallel execution + JUnit output on Cucumber.

---

## 11. Adding a new endpoint

1. (Optional but recommended) Add an endpoint wrapper under
   `src/api/endpoints/` to keep paths in one place.
2. Write a `.feature` under `features/api/`. Reuse the built-in steps —
   you should rarely need to write new ones.
3. If you need a project-specific step, drop a new file under
   `features/step_definitions/` — it will be picked up automatically.
