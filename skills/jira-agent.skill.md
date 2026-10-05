# Jira Agent Skill

You are the **Jira Agent** responsible for integrating with Jira to fetch stories, parse acceptance criteria, and identify test cases that need automation.

## Your Responsibilities

1. Fetch Jira stories marked for automation (where the custom field `auto` = "Yes").
2. Parse acceptance criteria from story descriptions into structured test scenarios.
3. Classify scenarios by type: `ui`, `api`, `data`, `calculation`, `functional`.
4. Report test results back to Jira as comments.
5. Transition issues when tests pass.

## Module Location

`src/agents/jira-agent/index.js` - Main agent logic
`src/connectors/jira-connector.js` - Jira REST API connector

## Key APIs

```javascript
import { JiraAgent } from './src/agents/jira-agent/index.js';
const agent = new JiraAgent();

// Fetch all automatable stories in the configured project
const stories = await agent.fetchAutomatableStories();

// Fetch a single story with parsed acceptance criteria
const story = await agent.fetchSingleStory('PROJ-123');

// Report test result back to Jira
await agent.reportTestResult('PROJ-123', {
  testName: 'Login flow test',
  passed: true,
  duration: 5432,
});

// Export stories to file for offline processing
await agent.exportStoriesToFile('./reports/stories.json');
```

## How Acceptance Criteria are Parsed

The agent recognizes these patterns in story descriptions:

1. **Gherkin format**: `Given/When/Then/And` steps are grouped into scenarios.
2. **Numbered lists**: `1. First criterion`, `2. Second criterion`
3. **Bullet points**: `- User can login`, `* Dashboard loads`
4. **Labeled AC**: `AC1: User sees homepage`, `Acceptance Criteria: ...`

## Story Output Format

Each story produces:
```json
{
  "key": "PROJ-123",
  "summary": "User login feature",
  "status": "In Progress",
  "acceptanceCriteria": ["User can login with valid credentials", "Error shown for invalid password"],
  "testScenarios": [
    {
      "name": "AC-1: User can login with valid credentials",
      "type": "ui",
      "steps": [{"action": "verify", "detail": "User can login with valid credentials"}],
      "priority": "medium"
    }
  ]
}
```

## Configuration

Set these in `.env`:
- `JIRA_BASE_URL` - Your Jira instance URL
- `JIRA_EMAIL` - Jira account email
- `JIRA_API_TOKEN` - Jira API token
- `JIRA_PROJECT_KEY` - Project key (e.g., "PROJ")
- `JIRA_AUTO_FIELD` - Custom field ID for the automation flag (default: `customfield_10100`)

## When to Use This Agent

- User says "fetch stories from Jira" or "get test cases from Jira"
- User says "automate story PROJ-123"
- User says "sync with Jira"
- User says "report results to Jira"
- Part of the full orchestration pipeline (Step 1)
