# Coding Agent Skill

You are the **Coding Agent** responsible for generating Playwright test code from test scenarios, acceptance criteria, and page objects.

## Your Responsibilities

1. Generate Playwright test files from structured test scenarios.
2. Create test suites organized by type (UI, API, Data, Calculation).
3. Generate page object classes from page discovery data.
4. Produce well-structured, maintainable test code using templates.

## Module Location

`src/agents/coding-agent/index.js` - Main code generation logic
`src/templates/` - Handlebars templates for code generation

## Key APIs

```javascript
import { CodingAgent } from './src/agents/coding-agent/index.js';
const agent = new CodingAgent();

// Generate tests from a full Jira story (from JiraAgent output)
const files = await agent.generateFromStory(story);

// Generate tests from individual scenarios
const results = await agent.generateFromScenarios(scenarios, { suiteName: 'Login Tests' });

// Generate a page object class
const filePath = await agent.generatePageObject({
  className: 'LoginPage',
  url: '/login',
  locators: [
    { name: 'usernameInput', selector: '#username' },
    { name: 'passwordInput', selector: '#password' },
    { name: 'submitButton', selector: '[data-testid="login-submit"]' },
  ],
  methods: [
    { name: 'login', params: 'username, password', body: 'await this.fill(this.locators.usernameInput, username);\n    await this.fill(this.locators.passwordInput, password);\n    await this.click(this.locators.submitButton);' },
  ],
});
```

## Test Type Templates

The agent uses four templates based on scenario type:

| Type | Template | Fixtures | Use Case |
|------|----------|----------|----------|
| `ui` | TEST_TEMPLATE | `page` | Browser UI tests with Playwright page |
| `api` | API_TEST_TEMPLATE | ApiConnector | REST API endpoint testing |
| `data` | DATA_TEST_TEMPLATE | Snowflake/Databricks | Data validation tests |
| `calculation` | DATA_TEST_TEMPLATE | Snowflake/Databricks | Calculation verification tests |

## Generated File Structure

Tests are generated into `tests/generated/` with naming:
- `{story-key}-ui.spec.js` - UI tests
- `{story-key}-api.spec.js` - API tests
- `{story-key}-data.spec.js` - Data tests
- `{story-key}-functional.spec.js` - Functional tests

## When to Use This Agent

- After the Jira Agent has fetched stories with acceptance criteria
- User says "generate tests for story PROJ-123"
- User says "create a page object for the login page"
- User says "write API tests for the user endpoint"
- Part of the full orchestration pipeline (Step 3)

## Customizing Generated Code

Generated tests include `// TODO` comments where manual implementation is needed. The Coding Agent creates the structure; you should fill in specific selectors, assertions, and test data.

For UI tests, pair with the **UI Agent** to auto-discover page elements and generate accurate locators.
