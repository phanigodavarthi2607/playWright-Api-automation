# Agent Playwright Framework

An AI agent-driven test automation framework built on Playwright. Seven specialized agents coordinate through a central orchestrator to deliver end-to-end test automation from Jira stories to executed tests with auto-healing capabilities.

Supports **multiple environments** (dev, UAT, BUAT, prod) with per-environment configuration, reporting, and tuned agent behavior.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                         │
│         Coordinates the full pipeline per env           │
└────┬──────┬──────┬──────┬──────┬──────┬──────┬────────┘
     │      │      │      │      │      │      │
     ▼      ▼      ▼      ▼      ▼      ▼      ▼
  ┌──────┐┌──────┐┌──────┐┌────┐┌──────┐┌──────┐┌──────┐
  │ Jira ││Coding││ Test ││ UI ││ Data ││ Test ││ Auto │
  │Agent ││Agent ││Cases ││Agt ││Compar││Analy ││ Heal │
  │      ││      ││Agent ││    ││Agent ││Agent ││Agent │
  └──┬───┘└──┬───┘└──┬───┘└─┬──┘└──┬───┘└──┬───┘└──┬───┘
     │       │       │      │      │       │       │
     ▼       ▼       ▼      ▼      ▼       ▼       ▼
  ┌──────┐┌──────────────┐┌──────────────┐┌─────────────┐
  │ Jira ││  Playwright   ││  Snowflake   ││  Locator    │
  │ API  ││  Browser      ││  Databricks  ││  Snapshots  │
  └──────┘└──────────────┘└──────────────┘└─────────────┘
```

## Agents

| Agent | Purpose | Skill File |
|-------|---------|------------|
| **Jira Agent** | Fetch stories, parse acceptance criteria, report results | `skills/jira-agent.skill.md` |
| **Coding Agent** | Generate Playwright test code from scenarios | `skills/coding-agent.skill.md` |
| **Test Cases Agent** | Manage test case registry, sync with Jira | `skills/test-cases-agent.skill.md` |
| **UI Agent** | Discover page elements, generate page objects | `skills/ui-agent.skill.md` |
| **Data Comparison Agent** | Compare data across Snowflake/Databricks | `skills/data-comparison-agent.skill.md` |
| **Test Analysis Agent** | Analyze results, detect flaky tests, recommend fixes | `skills/test-analysis-agent.skill.md` |
| **Auto Healing Agent** | Fix broken locators when UI changes | `skills/auto-healing-agent.skill.md` |

## Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install
```

### 2. Configure environments

```bash
# Copy the example files for each environment you need:
cp .env.dev.example  .env.dev
cp .env.uat.example  .env.uat
cp .env.buat.example .env.buat
cp .env.prod.example .env.prod

# Edit each file with environment-specific credentials and URLs
```

### 3. Run tests against an environment

```bash
# Run all tests against a specific environment
npm run test:dev
npm run test:uat
npm run test:buat
npm run test:prod

# Or set TEST_ENV inline
TEST_ENV=uat npx playwright test
```

### 4. Run the full pipeline per environment

```bash
npm run orchestrate:dev     # Full pipeline against dev
npm run orchestrate:uat     # Full pipeline against UAT
npm run orchestrate:buat    # Full pipeline against BUAT
npm run orchestrate:prod    # Full pipeline against prod
```

## Multi-Environment Support

### How it works

Set the `TEST_ENV` variable to select an environment. The framework:

1. Loads `.env.{TEST_ENV}` (e.g., `.env.uat`), falling back to `.env` if the file is missing.
2. Applies per-environment defaults for log level, retries, workers, timeouts, and agent thresholds.
3. Writes reports to a per-environment subdirectory (`reports/uat/`, `reports/prod/`, etc.).
4. Includes the environment name in every log line and in Playwright report metadata.

### Environment-specific defaults

| Setting | dev | uat | buat | prod |
|---------|-----|-----|------|------|
| Log level | debug | info | info | warn |
| Playwright retries | 1 | 2 | 2 | 0 |
| Playwright workers | auto | 2 | 2 | 1 |
| Test timeout | 60s | 90s | 90s | 120s |
| Heal attempts | 3 | 3 | 3 | 1 |
| Locator similarity threshold | 0.7 | 0.7 | 0.7 | 0.9 |
| Trace capture | on-first-retry | on-first-retry | on-first-retry | off |
| Video capture | retain-on-failure | retain-on-failure | retain-on-failure | off |

Any of these can be overridden per-environment in the `.env.{env}` file.

### Per-environment npm scripts

```bash
# Test suites
npm run test:dev            # All tests against dev
npm run test:uat:ui         # UI tests against UAT
npm run test:buat:api       # API tests against BUAT
npm run test:prod:data      # Data tests against prod

# Orchestration pipeline
npm run orchestrate:dev
npm run orchestrate:uat
npm run orchestrate:buat
npm run orchestrate:prod
```

### Reports

Reports are separated by environment:

```
reports/
  dev/
    results.json
    html/
    agent.log
  uat/
    results.json
    html/
    agent.log
  prod/
    ...
```

### CI Example

```yaml
jobs:
  test:
    strategy:
      matrix:
        env: [dev, uat, buat]
    steps:
      - run: TEST_ENV=${{ matrix.env }} npm test
```

## Pipeline Workflow

The orchestrator runs this sequence:

1. **Jira Fetch** - Fetches stories where the automation custom field = "Yes"
2. **Test Case Sync** - Registers test cases in the local registry
3. **Code Generation** - Generates Playwright test files from acceptance criteria
4. **Test Execution** - Runs generated tests via Playwright
5. **Analysis** - Parses results, categorizes failures, detects flaky tests
6. **Auto Healing** - Fixes broken locators if locator failures are found
7. **Reporting** - Posts results back to Jira as comments

## Project Structure

```
├── src/
│   ├── agents/
│   │   ├── orchestrator.js              # Central coordinator
│   │   ├── jira-agent/index.js          # Jira integration
│   │   ├── coding-agent/index.js        # Test code generator
│   │   ├── test-cases-agent/index.js    # Test case management
│   │   ├── ui-agent/index.js            # UI discovery & page objects
│   │   ├── data-comparison-agent/index.js  # Data validation
│   │   ├── test-analysis-agent/index.js # Results analysis
│   │   └── auto-healing-agent/          # Locator auto-fix
│   │       ├── index.js
│   │       └── snapshot.js
│   ├── connectors/
│   │   ├── jira-connector.js            # Jira REST API client
│   │   ├── snowflake-connector.js       # Snowflake SQL client
│   │   ├── databricks-connector.js      # Databricks SQL client
│   │   └── api-connector.js             # Generic HTTP client
│   ├── core/
│   │   ├── config.js                    # Multi-env configuration
│   │   ├── logger.js                    # Winston logger (env-aware)
│   │   └── browser-manager.js           # Browser lifecycle
│   ├── pages/
│   │   └── base-page.js                 # Page Object base class
│   └── index.js                         # All exports
├── tests/
│   ├── ui/                              # UI test specs
│   ├── api/                             # API test specs
│   ├── data/                            # Data comparison tests
│   └── generated/                       # Auto-generated tests
├── skills/                              # Copilot skill files
├── reports/                             # Per-env test reports
│   ├── dev/
│   ├── uat/
│   ├── buat/
│   └── prod/
├── locator-snapshots/                   # Snapshots for auto-healing
├── playwright.config.js
├── package.json
├── .env.example                         # Base template
├── .env.dev.example                     # Dev environment template
├── .env.uat.example                     # UAT environment template
├── .env.buat.example                    # BUAT environment template
└── .env.prod.example                    # Prod environment template
```

## Individual Agent Usage

### Jira Agent

```bash
npm run jira:fetch          # Export automatable stories to JSON
```

```javascript
import { JiraAgent } from './src/index.js';
const agent = new JiraAgent();
const story = await agent.fetchSingleStory('PROJ-123');
```

### Data Comparison Agent

```javascript
import { DataComparisonAgent } from './src/index.js';
const agent = new DataComparisonAgent();
await agent.initConnections({ useSnowflake: true, useDatabricks: true });

const result = await agent.compareData(sourceQuery, targetQuery, {
  keyColumns: ['id'],
  compareColumns: ['amount', 'status'],
  tolerance: 0.01,
});

const calcResult = await agent.validateCalculation(query, 'snowflake', {
  resultColumn: 'total',
  inputColumns: ['quantity', 'unit_price'],
  formula: ([qty, price]) => qty * price,
  tolerance: 0.01,
});
```

### Auto Healing Agent

```bash
npm run snapshot:locators -- https://your-app.com/login https://your-app.com/dashboard
npm run heal
```

### Test Analysis Agent

```bash
npm run analyze
```

## Copilot Skill Files

Each agent has a skill file in `skills/` that tells the AI copilot how to use it. Read a skill file to get available APIs, usage examples, when to invoke the agent, and configuration needed.

The `skills/orchestrator.skill.md` file describes the full pipeline and how all agents work together.

## Configuration Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `TEST_ENV` | Target environment: `dev`, `uat`, `buat`, `prod` | No (default: dev) |
| `JIRA_BASE_URL` | Jira instance URL | Yes (for Jira agent) |
| `JIRA_EMAIL` | Jira account email | Yes (for Jira agent) |
| `JIRA_API_TOKEN` | Jira API token | Yes (for Jira agent) |
| `JIRA_PROJECT_KEY` | Jira project key | Yes (for Jira agent) |
| `JIRA_AUTO_FIELD` | Custom field for automation flag | No (default: customfield_10100) |
| `SNOWFLAKE_*` | Snowflake connection details | Yes (for data agent) |
| `DATABRICKS_*` | Databricks connection details | Yes (for data agent) |
| `APP_BASE_URL` | Application URL for UI tests | Yes (for UI tests) |
| `APP_API_BASE_URL` | API base URL | Yes (for API tests) |
| `AGENT_LOG_LEVEL` | Override log level | No (per-env default) |
| `AGENT_MAX_HEAL_ATTEMPTS` | Max healing strategy attempts | No (per-env default) |
| `AGENT_LOCATOR_SIMILARITY_THRESHOLD` | Min confidence for auto-fix | No (per-env default) |
| `REPORT_OUTPUT_DIR` | Override report output directory | No (default: reports/{env}) |
