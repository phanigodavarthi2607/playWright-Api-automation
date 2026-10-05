# Agent Playwright Framework

An enterprise-grade, AI agent-driven test automation framework built on Playwright. Onboard **any project** across your organisation by answering a structured set of questions -- agents generate the complete test setup, including page objects, API stubs, data validations, per-environment configs, and Jira integration.

## How It Works

```
┌───────────────────────────────────────────────────────────┐
│                   ONBOARDING AGENT                         │
│   Ask 20 questions about a new project → scaffold it all   │
└────────────────────────┬──────────────────────────────────┘
                         │ generates
                         ▼
        ┌──────────────────────────────┐
        │     PROJECT (any app)         │
        │  project.config.js            │
        │  .env.dev / .env.uat / .env.prod
        │  tests/ pages/ reports/       │
        └────────────────┬─────────────┘
                         │ runs on
                         ▼
┌────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                            │
│          Coordinates agents per env per project             │
└──┬───────┬───────┬───────┬───────┬───────┬───────┬────────┘
   ▼       ▼       ▼       ▼       ▼       ▼       ▼
 Jira   Coding   Test    UI    Data     Test    Auto
 Agent  Agent   Cases   Agent  Compare  Analysis Heal
               Agent                   Agent   Agent
```

## Quick Start

### Option A: AI Copilot (recommended)

Tell your Copilot:

> "Set up a new project called Customer Portal. It's a fullstack app with dev, UAT, and prod environments."

The Copilot reads `skills/onboarding-agent.skill.md` and walks you through 20 targeted questions, then generates everything.

### Option B: Interactive CLI

```bash
npm run init
```

Launches a terminal wizard that asks the same questions interactively.

### Option C: Programmatic

```javascript
import { OnboardingAgent } from './src/agents/onboarding-agent/index.js';

const agent = new OnboardingAgent();
agent.setAnswers({
  projectName: 'Order System',
  projectKey: 'order-sys',
  projectType: 'fullstack',
  teamName: 'Commerce',
  environments: ['dev', 'uat', 'buat', 'prod'],
  devAppUrl: 'https://dev.orders.company.com',
  uatAppUrl: 'https://uat.orders.company.com',
  buatAppUrl: 'https://buat.orders.company.com',
  prodAppUrl: 'https://orders.company.com',
  authMethod: 'sso',
  jiraProjectKey: 'ORD',
  testCategories: ['ui', 'api', 'data-comparison', 'regression', 'smoke'],
  pages: [
    { name: 'Login', path: '/login' },
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Order List', path: '/orders' },
  ],
  apiEndpoints: [
    { name: 'List Orders', method: 'GET', path: '/api/orders' },
    { name: 'Create Order', method: 'POST', path: '/api/orders' },
  ],
  dataSources: [{ name: 'Warehouse', type: 'snowflake' }],
  dataComparisons: [{
    name: 'Orders source vs target',
    sourceType: 'snowflake', sourceTable: 'raw.orders',
    targetType: 'snowflake', targetTable: 'curated.orders',
    keyColumns: ['order_id'],
  }],
});

const { config } = agent.generateProjectConfig();
await agent.scaffoldProject('./projects/order-sys', config);
```

## What Gets Generated

For every onboarded project:

```
projects/order-sys/
├── project.config.js              # Project manifest (all answers)
├── playwright.config.js           # Pre-configured for declared browsers & envs
├── package.json                   # With test:dev, test:uat, orchestrate:prod scripts
├── .env.dev.example               # Dev credentials template
├── .env.uat.example               # UAT credentials template
├── .env.buat.example              # BUAT credentials template
├── .env.prod.example              # Prod credentials template
├── .gitignore
├── src/pages/
│   ├── login-page.js              # Login page object (if auth configured)
│   ├── dashboard-page.js          # Page objects for declared pages
│   └── order-list-page.js
├── tests/
│   ├── smoke/smoke.spec.js        # Reachability smoke test
│   ├── ui/
│   │   ├── dashboard.spec.js      # UI test stubs per page
│   │   └── order-list.spec.js
│   ├── api/endpoints.spec.js      # API test stubs per endpoint
│   ├── data/validations.spec.js   # Data comparison + calculation tests
│   ├── regression/
│   └── e2e/
├── reports/
└── locator-snapshots/
```

## The 20 Questions

The onboarding agent asks these sections (questions are skipped if not applicable):

| # | Section | Key Questions |
|---|---------|--------------|
| 1-4 | Project Identity | Name, key, team, description |
| 5 | Project Type | `web`, `api`, `data`, or `fullstack` |
| 6-8 | Environments | Which envs, app URLs, API URLs per env |
| 9-11 | Authentication | Auth method, login path, login selectors |
| 12-13 | Jira | Project key, auto-field ID |
| 14-15 | UI Testing | Key pages/flows, browsers (web/fullstack only) |
| 16 | API Testing | Key endpoints (api/fullstack only) |
| 17-19 | Data Testing | Data sources, comparisons, calculations (data/fullstack only) |
| 20 | Test Strategy | Test categories (smoke, regression, e2e, etc.) |

## Agents

| Agent | Purpose | Skill File |
|-------|---------|------------|
| **Onboarding Agent** | Ask questions, generate project setup | `skills/onboarding-agent.skill.md` |
| **Jira Agent** | Fetch stories, parse AC, report results | `skills/jira-agent.skill.md` |
| **Coding Agent** | Generate test code from scenarios | `skills/coding-agent.skill.md` |
| **Test Cases Agent** | Manage test registry, sync Jira | `skills/test-cases-agent.skill.md` |
| **UI Agent** | Discover elements, generate page objects | `skills/ui-agent.skill.md` |
| **Data Comparison Agent** | Validate across Snowflake/Databricks | `skills/data-comparison-agent.skill.md` |
| **Test Analysis Agent** | Analyze results, detect flaky tests | `skills/test-analysis-agent.skill.md` |
| **Auto Healing Agent** | Fix broken locators automatically | `skills/auto-healing-agent.skill.md` |

## Multi-Environment Support

```bash
# Run against any environment
npm run test:dev
npm run test:uat
npm run test:buat
npm run test:prod

# Environment-specific test types
npm run test:uat:ui
npm run test:prod:api
npm run test:dev:data

# Full pipeline per environment
npm run orchestrate:dev
npm run orchestrate:uat
npm run orchestrate:prod
```

| Setting | dev | uat | buat | prod |
|---------|-----|-----|------|------|
| Log level | debug | info | info | warn |
| Retries | 1 | 2 | 2 | 0 |
| Workers | auto | 2 | 2 | 1 |
| Timeout | 60s | 90s | 90s | 120s |
| Trace/video | on | on | on | off |

## Enterprise Features

### Organisation Standards

Create `enterprise.config.js` (copy from `enterprise.config.example.js`) to enforce:

- Mandatory browsers and test categories across all projects
- Required environments every project must have
- Naming conventions for test files and page objects
- Shared data source definitions
- Centralized reporting settings

### Project Registry

Every onboarded project is tracked in `enterprise-registry.json`:

```javascript
import { EnterpriseManager } from './src/enterprise/manager.js';

const enterprise = new EnterpriseManager('.');
await enterprise.loadRegistry();

enterprise.getAllTeams();                     // ['Platform', 'Data', 'QA']
enterprise.getProjectsByTeam('Platform');     // [{ key: 'cust-portal', ... }]
await enterprise.generateCrossProjectReport(); // org-wide summary
```

### Standards Compliance Check

```javascript
const compliance = enterprise.validateAgainstStandards(projectConfig);
if (!compliance.compliant) {
  console.log('Violations:', compliance.violations);
}
```

## Pipeline Workflow

The orchestrator runs this sequence per project per environment:

1. **Jira Fetch** - Stories where auto field = "Yes"
2. **Test Case Sync** - Register in local registry
3. **Code Generation** - Generate Playwright test files
4. **Test Execution** - Run via Playwright
5. **Analysis** - Categorize failures, detect flaky tests
6. **Auto Healing** - Fix broken locators
7. **Jira Reporting** - Post results back

## Project Structure

```
agent-playwright-framework/              # The framework (shared across org)
├── src/
│   ├── agents/
│   │   ├── onboarding-agent/            # Project onboarding wizard
│   │   │   ├── index.js                 # Question set + scaffolder
│   │   │   └── cli.js                   # Interactive CLI
│   │   ├── orchestrator.js              # Central coordinator
│   │   ├── jira-agent/                  # Jira integration
│   │   ├── coding-agent/                # Code generation
│   │   ├── test-cases-agent/            # Test case management
│   │   ├── ui-agent/                    # UI discovery
│   │   ├── data-comparison-agent/       # Data validation
│   │   ├── test-analysis-agent/         # Results analysis
│   │   └── auto-healing-agent/          # Locator auto-fix
│   ├── connectors/                      # Jira, Snowflake, Databricks, API
│   ├── core/
│   │   ├── config.js                    # Multi-env configuration
│   │   ├── project-config-schema.js     # Project config schema + validator
│   │   └── logger.js                    # Env-aware logging
│   ├── enterprise/
│   │   └── manager.js                   # Org standards + project registry
│   ├── pages/base-page.js              # Page Object base class
│   └── index.js                         # All exports
├── skills/                              # Copilot skill files (8 agents)
├── enterprise.config.example.js         # Org config template
├── projects/                            # Onboarded project workspaces
│   ├── cust-portal/
│   ├── order-sys/
│   └── dwh-etl/
└── tests/                               # Framework-level tests
```

## Configuration Reference

| Variable | Description |
|----------|-------------|
| `TEST_ENV` | Target environment: `dev`, `uat`, `buat`, `prod` |
| `JIRA_BASE_URL` | Jira instance URL |
| `JIRA_EMAIL` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token |
| `JIRA_PROJECT_KEY` | Jira project key |
| `JIRA_AUTO_FIELD` | Custom field ID for automation flag |
| `SNOWFLAKE_*` | Snowflake connection details |
| `DATABRICKS_*` | Databricks connection details |
| `APP_BASE_URL` | Application URL |
| `APP_API_BASE_URL` | API base URL |
| `AGENT_LOG_LEVEL` | Override log level |
| `AGENT_MAX_HEAL_ATTEMPTS` | Healing strategy attempts |
| `AGENT_LOCATOR_SIMILARITY_THRESHOLD` | Min confidence for auto-fix |
