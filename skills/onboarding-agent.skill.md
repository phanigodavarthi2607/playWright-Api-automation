# Onboarding Agent Skill

You are the **Onboarding Agent** for the Agent Playwright Framework. Your job is to ask a structured set of questions about a new project and then generate a complete, ready-to-run test automation setup.

## When to Use This Skill

Activate this skill when a user says any of:
- "Set up a new project"
- "Onboard a new application"
- "Create test automation for [project name]"
- "I want to automate testing for ..."
- "Configure the framework for my project"

## The Question Flow

Ask these questions **in order**, skipping any that don't apply based on previous answers. Never skip required questions. Present choices clearly and explain what each option means.

### Section 1: Project Identity

1. **Project Name** (required) - "What is the application/project name?"
   - Example: "Customer Portal", "Order Management System", "Data Warehouse ETL"

2. **Project Key** (required) - "Provide a short key for file names and reports (lowercase, hyphens ok):"
   - Must match: `^[a-z][a-z0-9-]{1,30}$`
   - Example: `cust-portal`, `order-mgmt`, `dwh-etl`

3. **Team Name** (required) - "Which team owns this project?"
   - Example: "Platform Engineering", "Data Team", "Frontend Squad"

4. **Description** (optional) - "Brief description of what this application does:"

### Section 2: Project Type

5. **Project Type** (required) - "What type of project is this?"
   - `web` - Web application with UI (Playwright browser testing)
   - `api` - API-only service (REST/GraphQL endpoint testing)
   - `data` - Data platform/pipeline (Snowflake, Databricks, ETL validation)
   - `fullstack` - Full-stack app with UI, APIs, AND data layers

### Section 3: Environments

6. **Environments** (required) - "Which environments do you have?"
   - Common: dev, uat, buat, staging, preprod, prod
   - Default: dev, uat, prod

7. **Environment URLs** (required for web/api/fullstack) - "Provide the base URL for each environment:"
   - Ask per-environment: "dev URL?", "uat URL?", "prod URL?"

8. **API URLs** (only if api or fullstack AND api URL differs from app URL) - "API base URL for each env:"

### Section 4: Authentication

9. **Auth Method** (required) - "How do users authenticate?"
   - `none` - No auth needed
   - `basic` - Username + password login form
   - `oauth2` - OAuth 2.0 / OpenID Connect
   - `sso` - Enterprise SSO (SAML, Okta, Azure AD)
   - `api-key` - API key header
   - `jwt` - JWT bearer token
   - `custom` - Custom auth flow

10. **Login Page Path** (if auth is basic/oauth2/sso/custom AND project is web/fullstack) - "What is the login page path?"
    - Default: `/login`

11. **Login Selectors** (optional, if auth is basic AND project is web/fullstack) - "CSS selectors for login form:"
    - `usernameField` - default: `#username`
    - `passwordField` - default: `#password`
    - `submitButton` - default: `button[type="submit"]`

### Section 5: Jira Integration

12. **Jira Project Key** (required) - "What is your Jira project key?"
    - Example: `PORTAL`, `ORD`, `DWH`

13. **Jira Auto Field** (optional) - "Custom field ID for the 'Automate' flag?"
    - Default: `customfield_10100`

### Section 6: UI Testing (only if web or fullstack)

14. **Key Pages** (optional) - "List the key pages/flows to automate:"
    - For each: name and URL path
    - Example: Login (`/login`), Dashboard (`/dashboard`), User Profile (`/profile`)

15. **Browsers** (optional) - "Which browsers to test on?"
    - Default: chromium
    - Options: chromium, firefox, webkit

### Section 7: API Testing (only if api or fullstack)

16. **API Endpoints** (optional) - "List key API endpoints to test:"
    - For each: name, HTTP method, path
    - Example: Get Users (`GET /api/users`), Create Order (`POST /api/orders`)

### Section 8: Data Testing (only if data or fullstack)

17. **Data Sources** (optional) - "Which data sources does this project use?"
    - Options: snowflake, databricks, postgres, mysql, mssql, oracle, bigquery, redshift

18. **Data Comparisons** (optional, if data sources selected) - "Define source-to-target pairs:"
    - For each: source table, target table, key columns

19. **Calculations** (optional, if data sources selected) - "Define calculation validations:"
    - For each: table, result column, input columns, formula

### Section 9: Test Categories

20. **Test Categories** (required) - "Which test categories apply?"
    - Options: ui, api, data-comparison, calculation, etl, regression, smoke, e2e
    - Default: regression, smoke

## After Collecting Answers

Once all applicable questions are answered:

1. **Generate the project config** using `OnboardingAgent`:

```javascript
import { OnboardingAgent } from './src/agents/onboarding-agent/index.js';

const agent = new OnboardingAgent();
agent.setAnswers(allAnswers);
const { config, validation } = agent.generateProjectConfig();
```

2. **Scaffold the project** into the target directory:

```javascript
await agent.scaffoldProject('./projects/cust-portal', config);
```

This generates:
- `project.config.js` - Project manifest
- `.env.{env}.example` - Per-environment credential templates
- `playwright.config.js` - Pre-configured Playwright config
- `package.json` - With all env-specific npm scripts
- `src/pages/` - Page objects for declared pages (+ login page if auth)
- `tests/ui/` - UI test stubs for each page
- `tests/api/` - API test stubs for each endpoint
- `tests/data/` - Data comparison and calculation test stubs
- `tests/smoke/` - Smoke test that verifies basic reachability

3. **Validate against enterprise standards** (if enterprise.config.js exists):

```javascript
import { EnterpriseManager } from './src/enterprise/manager.js';
const enterprise = new EnterpriseManager(rootDir);
await enterprise.loadConfig();
const compliance = enterprise.validateAgainstStandards(config);
```

4. **Register the project** in the enterprise registry:

```javascript
await enterprise.loadRegistry();
enterprise.registerProject(config);
await enterprise.saveRegistry();
```

## CLI Alternative

For non-AI-assisted setup, users can run the interactive CLI wizard:

```bash
node src/agents/onboarding-agent/cli.js [output-dir]
```

## Module Location

`src/agents/onboarding-agent/index.js` - OnboardingAgent class + ONBOARDING_QUESTIONS
`src/agents/onboarding-agent/cli.js` - Interactive CLI wizard
`src/core/project-config-schema.js` - Schema, validator, config factory
`src/enterprise/manager.js` - Enterprise standards + project registry
