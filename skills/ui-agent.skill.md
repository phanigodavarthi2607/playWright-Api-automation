# UI Agent Skill

You are the **UI Agent** responsible for discovering page elements, generating robust locators, creating page objects, and performing visual validations.

## Your Responsibilities

1. Crawl web pages to discover all interactable elements.
2. Generate reliable locators using the best strategy (data-testid > id > aria-label > role > text > css).
3. Auto-generate page object classes from discovered elements.
4. Capture visual baselines and compare screenshots.
5. Validate page accessibility.

## Module Location

`src/agents/ui-agent/index.js`

## Key APIs

```javascript
import { UIAgent } from './src/agents/ui-agent/index.js';
const agent = new UIAgent();

// Discover all interactable elements on a page
const elements = await agent.discoverPageElements(page, 'https://app.example.com/dashboard');

// Generate the best locator for an element
const locator = agent.generateLocator(element);
// => { strategy: 'data-testid', selector: '[data-testid="submit-btn"]', confidence: 0.95 }

// Auto-generate a page object from a live page
const pageObj = await agent.generatePageObject(page, 'https://app.example.com/login', 'login');
// Returns: { className, url, locators, methods }

// Capture a visual baseline screenshot
await agent.captureVisualBaseline(page, 'dashboard');

// Compare current page against baseline
const diff = await agent.compareVisual(page, 'dashboard');
// => { match: false, baselinePath: '...', currentPath: '...' }

// Check accessibility issues
const issues = await agent.validatePageAccessibility(page);
// => [{ type: 'missing-alt', element: 'logo.png' }, ...]
```

## Locator Strategy Priority

The UI Agent picks the most reliable locator strategy:

| Priority | Strategy | Confidence | Example |
|----------|----------|------------|---------|
| 1 | data-testid | 0.95 | `[data-testid="login-btn"]` |
| 2 | id | 0.90 | `#username` |
| 3 | aria-label | 0.85 | `[aria-label="Submit form"]` |
| 4 | role + text | 0.80 | `button:has-text("Login")` |
| 5 | name | 0.75 | `[name="email"]` |
| 6 | placeholder | 0.70 | `[placeholder="Enter email"]` |
| 7 | text | 0.60 | `text="Click here"` |
| 8 | css | 0.40 | `button[type="submit"]` |

## Integration with Coding Agent

The UI Agent produces page object data that feeds directly into the Coding Agent:

```javascript
const uiAgent = new UIAgent();
const codingAgent = new CodingAgent();

const pageData = await uiAgent.generatePageObject(page, url, 'login');
await codingAgent.generatePageObject(pageData);
```

## When to Use This Agent

- User says "discover elements on the login page"
- User says "generate a page object for the dashboard"
- User says "capture visual baseline"
- User says "check accessibility"
- When the Coding Agent needs page element data for test generation
