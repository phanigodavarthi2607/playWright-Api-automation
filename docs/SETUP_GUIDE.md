# Setup Guide — From Zero to a Running Test in Your Company

This guide assumes you know **nothing** about the framework yet and that you
have to set it up inside your company from scratch (no external copy-paste
into chat tools, no sample data leaving the org). Follow the steps in order;
each one tells you **what to do** and **why** it exists.

> If you just want the short version, see `docs/QUICKSTART.md` (TBD) or the
> root `README.md`. Use this guide for your first onboarding.

---

## Step 0 — What you're about to install

A **BDD API automation framework**:

```
┌────────────────────────────────────────────────────────────────────┐
│  features/*.feature        (plain English Gherkin scenarios)        │
│           │                                                         │
│           ▼                                                         │
│  features/step_definitions/*.js     (re-usable step glue, provided) │
│           │                                                         │
│           ▼                                                         │
│  features/support/world.js + hooks.js                               │
│           │                                                         │
│           ▼                                                         │
│  src/api/ApiClient.js  ──────▶  src/api/AuthService.js (SM_SESSION) │
│           │                                                         │
│           ▼                                                         │
│  Your company's APIs                                                │
│                                                                     │
│  Assertions:                                                        │
│    • Status / field-level                                           │
│    • Baseline (snapshot) JSON files in /baselines                   │
│    • API response  ◄──▶  Databricks / Snowflake rows                │
└────────────────────────────────────────────────────────────────────┘
```

You write `.feature` files; the framework runs the HTTP calls, attaches the
`SM_SESSION` cookie, and asserts using either stored baselines or live
warehouse queries.

---

## Step 1 — Install the prerequisites on your machine

Before touching the repo you need three things:

| Tool      | Minimum version | Why                                              |
| --------- | --------------- | ------------------------------------------------ |
| **Node.js** | 18 LTS (20+ recommended) | Runtime for Cucumber, Playwright, the SDKs. |
| **npm**     | 9+              | Comes with Node; used to install dependencies.   |
| **Git**     | any modern version | To clone the repo and version-control your tests. |
| **An IDE**  | VS Code recommended | The Cucumber and ESLint extensions help a lot.   |

**How to check:**

```bash
node --version    # should print v18.x or v20.x
npm --version
git --version
```

If any are missing, install from your company's approved software portal or
from <https://nodejs.org/>.

> **Behind a corporate proxy?** Set the npm proxy *once*:
> ```bash
> npm config set proxy http://your-proxy:port
> npm config set https-proxy http://your-proxy:port
> npm config set registry https://your.internal.registry/ # if you have one
> ```

---

## Step 2 — Get the code into your company Git

You have two paths. Pick one:

### Option A — Clone this repo and re-host in your company Git (recommended)

1. Clone locally:
   ```bash
   git clone https://github.com/<this-org>/playWright-Api-automation.git
   cd playWright-Api-automation
   ```
2. Repoint the remote to your company's GitLab / Bitbucket / GitHub Enterprise:
   ```bash
   git remote remove origin
   git remote add origin https://git.yourcompany.com/qa/api-automation.git
   git push -u origin main
   ```

### Option B — Recreate the structure file by file

Only do this if your security policy forbids importing external repos. Use
`docs/ARCHITECTURE.md` as the blueprint — every file has a one-line purpose
description. Recreate folders in this order:

```
config/  →  src/  →  features/support/  →  features/step_definitions/
       →  features/api/  →  tests/unit/  →  package.json + cucumber.js
       →  playwright.config.js  →  .eslintrc.json  →  .env.example
```

Either way, you end up with the same tree.

---

## Step 3 — Install npm dependencies

From the repo root:

```bash
npm install
```

What this installs and **why**:

| Package | Purpose |
| --- | --- |
| `@cucumber/cucumber` | Runs `.feature` files and provides `Given/When/Then`. |
| `@playwright/test`   | Provides `APIRequestContext` (the HTTP engine) and the unit-test runner. |
| `dotenv`             | Reads `.env.<env>` files into `process.env`. |
| `cross-env`          | Sets env vars on Windows + Linux + macOS in npm scripts. |
| `eslint`             | Static analysis. |
| `ajv` / `ajv-formats`| JSON-schema validation (optional, used if you add schema steps). |
| `@databricks/sql`    | (optional) Databricks driver — installed automatically; needed only for `@databricks` scenarios. |
| `snowflake-sdk`      | (optional) Snowflake driver — needed only for `@snowflake` scenarios. |

> If `npm install` is slow or fails on the optional drivers, you can install
> with `--omit=optional` and add them later only on the machines that need
> them:
> ```bash
> npm install --omit=optional
> npm install @databricks/sql        # later, only if needed
> npm install snowflake-sdk          # later, only if needed
> ```

**Sanity check:**

```bash
npx cucumber-js --version
npx playwright --version
```

Both should print a version.

---

## Step 4 — Understand the environment model

The framework supports **three environments**: `dev`, `uat`, `buat`. Each
one reads its config from a separate file at the repo root:

```
.env.dev     ← values for the DEV environment
.env.uat     ← values for the UAT environment
.env.buat    ← values for the BUAT environment
```

At runtime the active environment is chosen by the `TEST_ENV` variable. The
npm scripts already set this for you:

```bash
npm run test:dev   # internally: TEST_ENV=dev  cucumber-js --profile dev
npm run test:uat   # internally: TEST_ENV=uat  cucumber-js --profile uat
npm run test:buat  # internally: TEST_ENV=buat cucumber-js --profile buat
```

The loader (`config/env.js`) automatically loads the matching `.env.<env>`
file and throws a clear error if a required variable is missing.

**Why three files instead of one?** Because every environment has different
URLs, credentials, and warehouse catalogues. Keeping them separate makes
the per-env diffs obvious and prevents the classic "I ran my UAT test
against PROD" mistake.

---

## Step 5 — Create your environment files

```bash
cp .env.example .env.dev
cp .env.example .env.uat
cp .env.example .env.buat
```

Now open each one and fill in real values. The variables are grouped:

### 5.1 Base URLs

```ini
API_BASE_URL=https://api.dev.yourcompany.com
AUTH_BASE_URL=https://auth.dev.yourcompany.com
```

- `API_BASE_URL` — every request you make via `ApiClient` is relative to this.
- `AUTH_BASE_URL` — usually the SiteMinder gateway. If it's the same host as
  the API, you can omit it; the loader falls back to `API_BASE_URL`.

### 5.2 SiteMinder / SM_SESSION authentication

You have two valid configurations. Pick one **per env**.

**Mode A — Real login (preferred for long runs):**

```ini
AUTH_LOGIN_PATH=/siteminder/login    # whatever your SiteMinder URL is
AUTH_USERNAME=svc-qa-uat
AUTH_PASSWORD=*** stored in a secret manager / CI variable ***
SM_SESSION=
```

The framework will POST `{username, password}` to
`AUTH_BASE_URL + AUTH_LOGIN_PATH` once per test run, extract `SMSESSION`
from `Set-Cookie` (or the JSON body), cache it, and attach it as a cookie
on every subsequent request.

**Mode B — Pre-issued token (good for quick local runs):**

```ini
SM_SESSION=paste-the-token-here
```

When `SM_SESSION` is non-empty the login call is **skipped entirely**.

> **Where do I get the token?** Log into the app in your browser, open
> DevTools → Application → Cookies, copy the `SMSESSION` value. Note that
> these tokens have a short TTL (often a few hours).

### 5.3 Tunables

```ini
REQUEST_TIMEOUT_MS=30000
RETRY_COUNT=1
LOG_LEVEL=info        # debug | info | warn | error
UPDATE_BASELINES=false
```

### 5.4 Databricks (only fill in if you'll run @databricks scenarios)

```ini
DATABRICKS_HOST=adb-1234567890.7.azuredatabricks.net
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/abcd1234
DATABRICKS_TOKEN=dapi************************
DATABRICKS_CATALOG=qa_catalog
DATABRICKS_SCHEMA=qa_schema
```

### 5.5 Snowflake (only fill in if you'll run @snowflake scenarios)

```ini
SNOWFLAKE_ACCOUNT=xy12345.eu-west-1
SNOWFLAKE_USERNAME=QA_USER
SNOWFLAKE_PASSWORD=***
SNOWFLAKE_WAREHOUSE=QA_WH
SNOWFLAKE_DATABASE=QA_DB
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_ROLE=QA_ROLE
```

> **Security:** these files are listed in `.gitignore` and **must never be
> committed**. For CI, use the secret store (Jenkins Credentials, GitLab CI
> Variables, GitHub Actions Secrets) and inject them at job runtime — see
> `docs/CI_INTEGRATION.md`.

---

## Step 6 — Verify the framework wiring before writing any tests

Run two safe commands that don't hit your APIs:

### 6.1 Cucumber dry-run

```bash
npx cucumber-js --dry-run
```

This walks every `.feature` file and confirms that every step has a
matching step definition. You want to see:

```
4 scenarios (4 skipped)
19 steps (19 skipped)
```

If you see "Undefined step" — a step in a feature has no matching glue.
Either fix the wording or add the step to `features/step_definitions/`.

### 6.2 Framework unit tests

```bash
npm run test:unit
```

These run the offline `deepDiff` self-tests. All 6 should pass. If they
fail you have an install problem; nothing else is worth debugging until
this is green.

---

## Step 7 — Run the existing sample features against your APIs

Before writing your own tests, point the existing sample features at a
real endpoint to confirm auth + transport + reporting work end-to-end.

1. Edit `features/api/users-baseline.feature` and change the path in
   `When I send a GET request to "/v1/users" ...` to **any** safe,
   idempotent GET endpoint in your DEV environment that requires
   SM_SESSION. A health endpoint or "current user" endpoint is ideal.
2. Remove the baseline assertion line for now (or leave it — on the first
   run the framework will auto-create the baseline file).
3. Run only that one feature:
   ```bash
   npm run test:dev -- features/api/users-baseline.feature
   ```
4. Watch the output:
   - `[INFO] Logging in to ...` — confirms `AuthService` is calling SiteMinder
   - `[INFO] SM_SESSION acquired successfully.`
   - Cucumber progress bar → green ticks → summary
5. Open `cucumber-report/cucumber-report.html` in your browser.

If this works, the heavy lifting is done.

---

## Step 8 — Write your first real feature

Pretend you want to test `GET /v2/orders` returning a list.

### 8.1 Create the file

`features/api/orders-baseline.feature`:

```gherkin
@baseline @orders
Feature: Orders API - listing
  Validate the orders list endpoint behaves the same across releases.

  Background:
    Given I am authenticated

  Scenario: Listing the first page returns the canonical shape
    When I send a GET request to "/v2/orders" with query:
      | page     | 1  |
      | pageSize | 20 |
    Then the response status should be 200
    And the response field "data" should exist
    And the response body should match the baseline "orders-list-page1" ignoring:
      | meta.requestId   |
      | meta.timestamp   |
      | data[].createdAt |
      | data[].updatedAt |
```

### 8.2 Run it

```bash
npm run test:dev -- features/api/orders-baseline.feature
```

- **First run:** the baseline file `baselines/dev/orders-list-page1.json`
  is auto-created. Open it, eyeball it, then **commit it** to git. This is
  now the "expected" response.
- **Subsequent runs:** any difference (other than the ignored paths) will
  fail the scenario with a precise diff.

### 8.3 When the response legitimately changes

You'll see a failure with a diff. If the change is intentional:

```bash
npm run baseline:update
git diff baselines/   # review the new shape
git commit -m "Refresh orders baseline for new field"
```

---

## Step 9 — Write a test that compares the API against the warehouse

This is the most powerful pattern in the framework: it catches cases where
the API silently disagrees with the source-of-truth in Databricks/Snowflake.

`features/api/orders-db.feature`:

```gherkin
@db @databricks @orders
Feature: Orders API matches the warehouse

  Background:
    Given I am authenticated

  Scenario: API order rows equal Databricks order rows
    When I send a GET request to "/v2/orders" with query:
      | page     | 1  |
      | pageSize | 50 |
    And I query Databricks:
      """
      SELECT order_id, customer_id, total_amount, status
      FROM ${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.orders
      ORDER BY order_id
      LIMIT 50
      """
    Then the response status should be 200
    And the response field "data" should match the DB rows with mapping:
      | order_id      | id           |
      | customer_id   | customerId   |
      | total_amount  | totalAmount  |
```

What this scenario does:

1. Calls the API, parses the JSON.
2. Connects to Databricks, runs your SQL, gets rows back.
3. Lowercases each DB column name (warehouses commonly return `UPPER_CASE`).
4. Applies your `columnMap` (DB column → API field) so `order_id` lines up
   with `id`, etc.
5. Asserts every API row equals its corresponding DB row.

> **Tip — `${DATABRICKS_CATALOG}` substitution:** the current SQL step does
> *not* substitute env vars inside the SQL string. If you want that, either
> wire it in (`db.steps.js` — small change), or write the catalog/schema
> directly in the Gherkin doc-string and keep one per env if needed.

### Skipping when the warehouse isn't configured

`@databricks`-tagged scenarios are **auto-skipped** on environments that
don't have `DATABRICKS_*` set. Same for `@snowflake`. This is what the
`Before({ tags: '@databricks' })` hook in `features/support/hooks.js` does
for you.

---

## Step 10 — Choose where tests live and how the team writes them

Recommended folder convention as you grow:

```
features/
  api/
    orders/
      orders-list.feature
      orders-create.feature
    users/
      users-list.feature
      users-detail.feature
    payments/
      ...
  step_definitions/
    common.steps.js         ← keep these untouched
    baseline.steps.js       ← keep these untouched
    db.steps.js             ← keep these untouched
    orders.steps.js         ← only project-specific steps go here
    payments.steps.js
  support/
    world.js  hooks.js  helpers.js
```

**Rule of thumb:** if a step is generic (`Given I send a POST...`) it
belongs in `common.steps.js`. If it embeds business logic (`Given a paid
order exists for customer "ACME"`) put it in a topic-specific file.

---

## Step 11 — Add the framework to CI

See `docs/CI_INTEGRATION.md` for ready-to-adapt Jenkins, GitLab CI, and
GitHub Actions pipelines. The essentials:

- Inject `AUTH_USERNAME`, `AUTH_PASSWORD`, `DATABRICKS_TOKEN`,
  `SNOWFLAKE_PASSWORD` from the CI secret store, *not* from `.env` files.
- Set `TEST_ENV=uat` (or whichever env that pipeline targets).
- Run `npm ci && npm run test:ci`.
- Archive the artifacts under `cucumber-report/`.

---

## Step 12 — Daily team workflow

1. Pull `main` and create a branch:
   ```bash
   git checkout -b feat/orders-list-tests
   ```
2. Write or update `.feature` files (and any topic-specific step files).
3. Run locally against DEV:
   ```bash
   npm run test:dev -- features/api/orders/
   ```
4. If baselines need refreshing:
   ```bash
   npm run baseline:update -- features/api/orders/
   git add baselines/
   ```
5. Lint:
   ```bash
   npm run lint
   ```
6. Commit and open a PR. The CI pipeline will run the full UAT suite.

---

## Step 13 — Troubleshooting cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing required env var "API_BASE_URL"` | `.env.<env>` not present or `TEST_ENV` not set | Create the file or use `npm run test:dev` |
| `Login failed (401 ...)` | bad creds or wrong `AUTH_LOGIN_PATH` | Verify the URL in a browser/curl; double-check creds |
| `No SMSESSION token found in Set-Cookie ...` | the login response uses a different cookie name or returns the token inside a JSON envelope you don't expect | Extend `extractSmSession` in `src/api/AuthService.js` to match your auth response |
| Baseline diff on every run on harmless fields like timestamps | you forgot to ignore them | Add the dot-path under the `ignoring:` table; `data[].field` is a wildcard |
| `@databricks/sql is not installed.` | optional dep not installed on this machine | `npm install @databricks/sql` |
| Databricks rows look right but comparison fails | column casing or rename | Use the `with mapping:` table to align `SNAKE_CASE` ↔ `camelCase` |
| Cucumber says "Undefined step" | typo in Gherkin, or missing step | Run `npx cucumber-js --dry-run` to find it; fix wording or add the step |
| Tests pass locally, fail in CI | env-specific data, or CI uses a different env file | Check `TEST_ENV`, baselines are stored per env under `baselines/<env>/` |
| `EAI_AGAIN` / proxy errors during `npm install` | corporate proxy | `npm config set proxy ... https-proxy ...` |

---

## Step 14 — Where to go next

- `README.md` — full step catalogue + npm scripts reference.
- `docs/ARCHITECTURE.md` — explains every file and how requests flow through
  the framework. Read this before changing the engine.
- `docs/CI_INTEGRATION.md` — ready-to-adapt CI pipelines.
- `features/api/users-baseline.feature` and `users-db.feature` — your
  canonical examples; copy the patterns, not the file.

---

## Appendix — One-liner cheat sheet

```bash
# Install once
npm install
cp .env.example .env.dev    # also .env.uat, .env.buat

# Quick sanity
npx cucumber-js --dry-run
npm run test:unit

# Run a single feature against UAT
npm run test:uat -- features/api/orders/orders-list.feature

# Refresh baselines after an intentional API change
npm run baseline:update

# Just smoke or just DB-comparison scenarios
npm run test:smoke
npm run test:db

# Tag expression
npm run test:tag -- '@orders and not @db'
```
