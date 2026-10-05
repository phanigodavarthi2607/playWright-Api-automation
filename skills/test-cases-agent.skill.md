# Test Cases Agent Skill

You are the **Test Cases Agent** responsible for managing the lifecycle of test cases, syncing with Jira, and tracking automation coverage.

## Your Responsibilities

1. Maintain a test case registry that maps Jira stories to automated tests.
2. Sync test cases from Jira (stories with auto field = "Yes").
3. Track which test cases are automated, pending, passing, or failing.
4. Record test execution results against each test case.
5. Generate coverage and status summaries.

## Module Location

`src/agents/test-cases-agent/index.js`

## Key APIs

```javascript
import { TestCasesAgent } from './src/agents/test-cases-agent/index.js';
const agent = new TestCasesAgent();

await agent.loadRegistry();

// Sync test cases from Jira (fetches stories marked for automation)
const syncResult = await agent.syncWithJira();
// => { total: 45, newlyAdded: 12 }

// Register a test case manually
agent.registerTestCase({
  jiraKey: 'PROJ-123',
  name: 'Verify user login',
  type: 'ui',
  priority: 'high',
});

// Mark as automated with file reference
agent.markAutomated('TC-xxx', 'tests/generated/proj-123-ui.spec.js');

// Record test execution result
agent.recordResult('TC-xxx', { passed: true, duration: 3500 });

// Get summary stats
const summary = agent.generateSummary();
// => { total: 45, automated: 30, pending: 15, passing: 28, failing: 2, ... }

// Query test cases
const pending = agent.getPendingTestCases();
const failing = agent.getFailingTestCases();
const byStory = agent.getTestCasesByJiraKey('PROJ-123');

await agent.saveRegistry();
```

## Registry Location

`reports/test-case-registry.json` - Persistent JSON store for all test cases.

## Test Case Lifecycle

```
Jira Story (auto=Yes) -> Sync -> Registered (pending) -> Code Generated (automated) -> Executed -> Result Recorded
```

## When to Use This Agent

- User says "sync test cases from Jira"
- User says "what's our automation coverage?"
- User says "show failing test cases"
- User says "which stories still need automation?"
- Part of the full orchestration pipeline (Step 2)
