# Architecture — How the Pieces Fit Together

Read this once before you start changing the engine. Every file in the
framework has a single, narrow purpose, and the layers cleanly separate
"what to test" (Gherkin) from "how to test it" (JavaScript).

---

## The three layers

```
┌────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Specification          (what & why)                     │
│    features/api/*.feature                                          │
│      Plain-English scenarios. Owned by QA + product. No code.      │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Translation            (how, in domain terms)           │
│    features/step_definitions/*.js                                  │
│      Maps each Gherkin sentence to a function call.                │
│    features/support/{world,hooks,helpers}.js                       │
│      Cross-cutting setup, state, utilities.                        │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Engine                 (how, in technical terms)        │
│    src/api/{ApiClient,AuthService,endpoints/*}.js                  │
│    src/db/{DatabricksClient,SnowflakeClient,dbCompare}.js          │
│    src/utils/{baseline,compare,logger}.js                          │
│    config/env.js                                                   │
└────────────────────────────────────────────────────────────────────┘
```

Touching Layer 1 should not require changes in Layer 3, and vice-versa.

---

## File-by-file reference

| Path | Purpose |
| --- | --- |
| `cucumber.js` | Cucumber profiles: `default`, `dev`, `uat`, `buat`, `baseline`, `db`, `smoke`, `ci`. Selects what to run, what to report. |
| `playwright.config.js` | Playwright Test runner — used **only** for the offline unit suite in `tests/unit/`. |
| `config/env.js` | Loads `.env.<TEST_ENV>`, validates required vars, returns a frozen env object used everywhere else. |
| `src/api/AuthService.js` | SiteMinder login. Reuses `SM_SESSION` if provided, otherwise POSTs username/password and parses `Set-Cookie` or JSON body. Caches the token process-wide. |
| `src/api/ApiClient.js` | Thin wrapper over `request.newContext()`. Injects `Cookie: SMSESSION=<token>`, applies env-driven `baseURL` and timeouts, exposes `get/post/put/patch/delete`. |
| `src/api/endpoints/UsersApi.js` | Optional pattern: a class that groups all routes for one resource. Recommended for any non-trivial API surface. |
| `src/db/DatabricksClient.js` | Lazy `@databricks/sql` wrapper. Connects, runs SQL, returns rows. Throws a friendly message if the SDK isn't installed. |
| `src/db/SnowflakeClient.js` | Same shape, for Snowflake. |
| `src/db/dbCompare.js` | `normalizeRow` lowercases & renames DB columns. `assertApiMatchesDb` does the actual compare via `deepDiff`. |
| `src/utils/compare.js` | Pure `deepDiff(expected, actual, opts)` + `formatDiffs(diffs)`. Supports `ignorePaths` (with `data[].field` wildcards) and `unorderedArrays`. |
| `src/utils/baseline.js` | `assertMatchesBaseline`: auto-creates on first run or `UPDATE_BASELINES=true`, otherwise loads and compares. Per-env subfolders. |
| `src/utils/logger.js` | Tiny log-level-aware console logger. |
| `features/support/world.js` | Custom `World` carrying `env`, `api`, `request`, `response`, `responseBody`, `dbRows`, `scratch`. |
| `features/support/hooks.js` | `Before` builds the `ApiClient`; `After` disposes it. `Before(@databricks)`/`Before(@snowflake)` skip when warehouse env vars are absent. `After` attaches response on failure. |
| `features/support/helpers.js` | `getPath`, `tableToObject`, `maybeJson`. |
| `features/step_definitions/common.steps.js` | Generic HTTP + response assertion steps. |
| `features/step_definitions/baseline.steps.js` | Baseline (snapshot) steps. |
| `features/step_definitions/db.steps.js` | Databricks/Snowflake query + comparison steps. |
| `baselines/<env>/<name>.json` | Stored snapshots. Commit them. |
| `tests/unit/compare.spec.js` | Offline Playwright Test specs for the diff util. Lets you smoke-test the framework with no API. |
| `.env.example` | Template — copy to `.env.dev`/`.env.uat`/`.env.buat`. |
| `.gitignore` | Keeps secrets and generated reports out of git. |
| `.eslintrc.json` | Lint rules. |

---

## The lifecycle of a single scenario

Let's trace exactly what happens when you run:

```bash
npm run test:uat -- features/api/orders/orders-list.feature
```

1. **Script expansion.** `cross-env TEST_ENV=uat cucumber-js --profile uat ...`
2. **Profile load.** `cucumber.js` is read; `uat` profile selects step
   definitions + reporters.
3. **Config load.** First `require('config/env')` call → `loadEnv()` →
   reads `.env.uat` → validates `API_BASE_URL` etc. → freezes the result.
4. **`BeforeAll` hook.** Logs the active env once.
5. **Per-scenario `Before` hook.**
   - Calls `ApiClient.create(env)`.
   - `ApiClient.create` calls `AuthService.getToken(env)`.
     - If `env.auth.smSession` is set → returned immediately.
     - Else → POST to `AUTH_BASE_URL + AUTH_LOGIN_PATH`, extract `SMSESSION`,
       cache it.
   - Builds a Playwright `APIRequestContext` with the cookie injected.
   - Stores the client on `this.api`.
6. **Step execution.** Each `When ... I send a GET ...` step calls
   `this.api.get(path, opts)`. The response and parsed body are stored on
   `this`. `Then` steps read from `this.response` / `this.responseBody`.
7. **Per-scenario `After` hook.**
   - On failure: serialise the last response, attach it to the report.
   - Always: `await this.api.dispose()`.
8. **Reporting.** Cucumber emits formatters listed in the profile
   (`html`, `json`, optionally `junit`) into `cucumber-report/`.

Two scenarios in the same run **share the cached SM_SESSION** (login is
once) but each gets a **fresh `APIRequestContext`** (clean cookie jar,
isolated state).

---

## Why each design choice

- **Cucumber on top of Playwright** — gives QA the readability and tag
  filtering of BDD, while still having Playwright's battle-tested
  `APIRequestContext` (proxy support, retries, tracing).
- **Per-env `.env` files** — keeps env-specific secrets and URLs visibly
  separated and prevents accidental cross-env runs.
- **Snapshot baselines stored in git** — the diff is part of the PR; any
  intentional change is reviewed, any accidental change is rejected.
- **DB-comparison as a first-class assertion** — many real bugs are
  "the API returns slightly different data than the warehouse"; this
  pattern catches them without writing custom code per endpoint.
- **Optional DB SDKs** — engineers running only `@baseline` tests don't
  pay the install cost of Databricks/Snowflake drivers.
- **Single `ApiClient` with cookie injection** — endpoint classes and step
  definitions never need to think about auth.

---

## Extending the engine

| You want to… | Touch this file(s) |
| --- | --- |
| Add a new generic step (e.g. `Then the response should be valid JSON`) | `features/step_definitions/common.steps.js` |
| Add a project-specific step (e.g. `Given a paid order exists for "ACME"`) | new `features/step_definitions/<topic>.steps.js` |
| Support a second auth scheme (e.g. OAuth2 client-credentials) | new `src/api/OAuthService.js` + branch inside `ApiClient.create` |
| Validate against a JSON Schema instead of a snapshot | new `features/step_definitions/schema.steps.js` using `ajv` (already installed) |
| Add a new environment (`prod`, `qa2`, …) | add to `VALID_ENVS` in `config/env.js`, add a profile in `cucumber.js`, add an npm script, create `.env.<name>` |
| Talk to a different SQL warehouse (Postgres, BigQuery, …) | new `src/db/<X>Client.js` implementing `connect/query/close`, then a step in `features/step_definitions/db.steps.js` |

---

## What NOT to do

- **Don't put assertions directly inside endpoint wrappers** — they belong
  in `Then` steps so failures show up in Cucumber's report.
- **Don't share state between scenarios via module-level variables** — use
  `this.scratch.<key>` on the World instead.
- **Don't read `process.env.*` directly inside steps or clients** — always
  go through `loadEnv()` so the validation happens in one place.
- **Don't commit `.env.*` files** — they're already gitignored.
- **Don't bypass `ApiClient`** to call `fetch` directly — you'll lose
  SM_SESSION injection and unified logging.
