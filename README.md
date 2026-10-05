# Agent Playwright Framework

An AI agent-driven test automation framework built on Playwright. Seven specialized agents coordinate through a central orchestrator to deliver end-to-end test automation from Jira stories to executed tests with auto-healing capabilities.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                         │
│           Coordinates the full pipeline                 │
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

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Jira, Snowflake, Databricks, and app credentials
```

### 3. Run the full pipeline

```bash
# Full pipeline: Jira -> Generate -> Execute -> Analyze -> Heal -> Report
npm run orchestrate

# Single story
node src/agents/orchestrator.js story PROJ-123

# Heal and re-run
node src/agents/orchestrator.js heal
```

### 4. Run tests directly

```bash
npm test                    # All tests
npm run test:ui             # UI tests only
npm run test:api            # API tests only
npm run test:data           # Data tests only
npm run test:generated      # Auto-generated tests
npm run test:headed         # Run with visible browser
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
│   │   ├── config.js                    # Configuration management
│   │   ├── logger.js                    # Winston logger
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
│   ├── orchestrator.skill.md
│   ├── jira-agent.skill.md
│   ├── coding-agent.skill.md
│   ├── test-cases-agent.skill.md
│   ├── ui-agent.skill.md
│   ├── data-comparison-agent.skill.md
│   ├── test-analysis-agent.skill.md
│   └── auto-healing-agent.skill.md
├── reports/                             # Test reports and analysis
├── locator-snapshots/                   # Snapshots for auto-healing
├── playwright.config.js
├── package.json
└── .env.example
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

// Compare tables
const result = await agent.compareData(sourceQuery, targetQuery, {
  keyColumns: ['id'],
  compareColumns: ['amount', 'status'],
  tolerance: 0.01,
});

// Validate calculations
const calcResult = await agent.validateCalculation(query, 'snowflake', {
  resultColumn: 'total',
  inputColumns: ['quantity', 'unit_price'],
  formula: ([qty, price]) => qty * price,
  tolerance: 0.01,
});
```

### Auto Healing Agent

```bash
# Take locator snapshots as baseline
npm run snapshot:locators -- https://your-app.com/login https://your-app.com/dashboard

# Heal and re-run failed tests
npm run heal
```

### Test Analysis Agent

```bash
npm run analyze             # Analyze latest test results
```

## Copilot Skill Files

Each agent has a skill file in `skills/` that tells the AI copilot how to use it. Read a skill file to get:
- What the agent does
- Available APIs and usage examples
- When to invoke the agent
- Configuration needed

The `skills/orchestrator.skill.md` file describes the full pipeline and how all agents work together.

## Configuration Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `JIRA_BASE_URL` | Jira instance URL | Yes (for Jira agent) |
| `JIRA_EMAIL` | Jira account email | Yes (for Jira agent) |
| `JIRA_API_TOKEN` | Jira API token | Yes (for Jira agent) |
| `JIRA_PROJECT_KEY` | Jira project key | Yes (for Jira agent) |
| `JIRA_AUTO_FIELD` | Custom field for automation flag | No (default: customfield_10100) |
| `SNOWFLAKE_*` | Snowflake connection details | Yes (for data agent) |
| `DATABRICKS_*` | Databricks connection details | Yes (for data agent) |
| `APP_BASE_URL` | Application URL for UI tests | Yes (for UI tests) |
| `APP_API_BASE_URL` | API base URL | Yes (for API tests) |
| `AGENT_MAX_HEAL_ATTEMPTS` | Max healing strategy attempts | No (default: 3) |
| `AGENT_LOCATOR_SIMILARITY_THRESHOLD` | Min confidence for auto-fix | No (default: 0.7) |
