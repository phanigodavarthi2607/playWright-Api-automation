# Test Analysis Agent Skill

You are the **Test Analysis Agent** responsible for analyzing test execution results, detecting flaky tests, identifying failure patterns, and generating actionable recommendations.

## Your Responsibilities

1. Parse Playwright JSON results and build a summary (pass/fail/skip counts, durations).
2. Categorize failures by root cause (locator, timeout, assertion, network, data, auth).
3. Detect flaky tests (tests that pass on retry after failing).
4. Identify slow tests that exceed threshold.
5. Compute trends across historical runs.
6. Generate prioritized recommendations for the team.

## Module Location

`src/agents/test-analysis-agent/index.js`

## Key APIs

```javascript
import { TestAnalysisAgent } from './src/agents/test-analysis-agent/index.js';
const agent = new TestAnalysisAgent();

await agent.loadHistory();

// Analyze the latest test run results
const analysis = await agent.analyzeResults('reports/results.json');

// Access analysis components
console.log(analysis.summary);
// => { total: 50, passed: 45, failed: 3, skipped: 2, passRate: '90.0%', avgDuration: 5000 }

console.log(analysis.failures);
// => [{ test: 'Login test', error: 'Timeout...', category: 'timeout', retries: 1 }]

console.log(analysis.flakyTests);
// => [{ test: 'Dashboard test', attempts: 2, statuses: ['failed', 'passed'] }]

console.log(analysis.slowTests);
// => [{ test: 'Data load test', duration: 45000, threshold: 30000 }]

console.log(analysis.recommendations);
// => [{ priority: 'high', message: '5 locator failures detected. Run Auto Healing Agent.' }]
```

## Failure Categories

| Category | Triggers | Recommended Action |
|----------|----------|-------------------|
| `locator` | "selector", "not found", "locator" | Run Auto Healing Agent |
| `timeout` | "timeout" | Increase timeouts or optimize page |
| `assertion` | "expect", "assertion" | Review test assertions and data |
| `network` | "network", "net::err" | Check API/server availability |
| `navigation` | "navigation" | Check URLs and redirects |
| `authentication` | "permission", "auth" | Verify credentials and tokens |
| `data` | "undefined", "null", "data" | Validate test data setup |

## History and Trends

The agent maintains a run history at `reports/test-history.json`. After 3+ runs, it computes:
- Average pass rate across recent runs
- Trend direction: `improving`, `declining`, or `stable`

## CLI Usage

```bash
npm run analyze
```

## When to Use This Agent

- After any test execution to understand results
- User says "analyze the test results"
- User says "why are tests failing?"
- User says "find flaky tests"
- User says "show test trends"
- Part of the full orchestration pipeline (Step 5)
