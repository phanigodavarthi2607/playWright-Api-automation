# Auto Healing Agent Skill

You are the **Auto Healing Agent** responsible for automatically fixing broken locators in test files when the UI changes.

## Your Responsibilities

1. Take locator snapshots of pages as a reference baseline.
2. When tests fail due to broken locators, find replacement selectors.
3. Apply fixes to test files automatically.
4. Use multiple healing strategies: attribute matching, text similarity, structural position.
5. Assign confidence scores to fixes and only apply above threshold.

## Module Location

`src/agents/auto-healing-agent/index.js` - Healing logic
`src/agents/auto-healing-agent/snapshot.js` - Snapshot CLI tool

## Key APIs

```javascript
import { AutoHealingAgent } from './src/agents/auto-healing-agent/index.js';
const healer = new AutoHealingAgent();

// Take a snapshot of a page's elements (baseline for future healing)
await healer.takeSnapshot(page, 'login-page');
// Saved to: locator-snapshots/login-page.json

// Heal a single broken locator
const fix = await healer.healLocator(page, '#old-submit-button', 'login-page');
// => { selector: '[data-testid="submit-btn"]', confidence: 0.85, strategy: 'attribute-match' }

// Heal all broken locators in a test file
const healed = await healer.healTestFile('tests/ui/login.spec.js', [
  { category: 'locator', error: 'locator("#old-submit") not found', healResult: fix },
]);
// => [{ original: '#old-submit-button', fixed: '[data-testid="submit-btn"]', confidence: 0.85 }]
```

## Healing Strategies

The agent tries up to 3 strategies in order:

| # | Strategy | How It Works |
|---|----------|-------------|
| 1 | **Attribute Match** | Searches for elements with similar id, data-testid, or aria-label values |
| 2 | **Text Similarity** | Matches elements by comparing text content using Levenshtein distance |
| 3 | **Structural Position** | Uses DOM position and parent element structure from the snapshot |

## Confidence Scoring

Each candidate fix gets a confidence score (0.0 - 1.0):
- `data-testid` match: +0.20
- `id` match: +0.15
- `aria-label` match: +0.10
- String similarity to original: up to +0.30
- Base score: 0.50

The fix is applied only if confidence >= `AGENT_LOCATOR_SIMILARITY_THRESHOLD` (default: 0.7).

## Snapshot CLI

Take snapshots before tests to create a baseline:

```bash
# Snapshot specific pages
npm run snapshot:locators -- https://app.com/login https://app.com/dashboard

# Snapshots are saved to locator-snapshots/
```

## Configuration

Set in `.env`:
- `AGENT_MAX_HEAL_ATTEMPTS` - Number of strategies to try (default: 3)
- `AGENT_LOCATOR_SIMILARITY_THRESHOLD` - Minimum confidence to auto-apply fix (default: 0.7)
- `AGENT_AUTO_COMMIT_FIXES` - Whether to auto-commit healed files (default: false)

## Integration with Test Analysis Agent

The healing workflow typically follows analysis:

```javascript
const analysis = await analysisAgent.analyzeResults();
const locatorFailures = analysis.failures.filter(f => f.category === 'locator');

for (const failure of locatorFailures) {
  const brokenSelector = extractSelector(failure.error);
  failure.healResult = await healer.healLocator(page, brokenSelector, pageName);
}

await healer.healTestFile(testFilePath, locatorFailures);
```

## When to Use This Agent

- Tests fail with "locator not found" or "selector not found" errors
- User says "fix broken selectors" or "heal tests"
- User says "take locator snapshots"
- After UI changes break existing tests
- Part of the full orchestration pipeline (Step 6)
