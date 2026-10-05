import fs from 'fs/promises';
import path from 'path';
import { createAgentLogger } from '../../core/logger.js';
import { validateProjectConfig, createDefaultConfig, PROJECT_TYPES, AUTH_METHODS, DATA_SOURCES, TEST_CATEGORIES } from '../../core/project-config-schema.js';

const log = createAgentLogger('OnboardingAgent');

/**
 * The complete question set used by the onboarding agent (CLI or Copilot) to
 * configure any new project.  Each question has an id (maps to the answers
 * object), display text, type, validation, and optional condition function.
 */
export const ONBOARDING_QUESTIONS = [
  {
    id: 'projectName',
    section: 'Project Identity',
    question: 'What is the project/application name?',
    type: 'text',
    required: true,
    example: 'Customer Portal',
  },
  {
    id: 'projectKey',
    section: 'Project Identity',
    question: 'Provide a short project key (used in filenames, reports, env vars):',
    type: 'text',
    required: true,
    example: 'cust-portal',
    validate: (v) => /^[a-z][a-z0-9-]{1,30}$/.test(v) || 'Must be lowercase alphanumeric with hyphens, 2-31 chars',
  },
  {
    id: 'teamName',
    section: 'Project Identity',
    question: 'Which team owns this project?',
    type: 'text',
    required: true,
    example: 'Platform Engineering',
  },
  {
    id: 'description',
    section: 'Project Identity',
    question: 'Brief description of what this application does:',
    type: 'text',
    required: false,
  },
  {
    id: 'projectType',
    section: 'Project Type',
    question: 'What type of project is this?',
    type: 'select',
    choices: PROJECT_TYPES,
    descriptions: {
      web: 'Web application with UI (browser testing)',
      api: 'API-only service (REST/GraphQL endpoint testing)',
      data: 'Data platform/pipeline (Snowflake, Databricks, ETL validation)',
      fullstack: 'Full-stack app with UI, APIs, and data layers',
    },
    required: true,
  },

  // --- Environments ---
  {
    id: 'environments',
    section: 'Environments',
    question: 'Which environments do you have? (comma-separated)',
    type: 'multi-select',
    choices: ['dev', 'uat', 'buat', 'staging', 'preprod', 'prod'],
    default: ['dev', 'uat', 'prod'],
    required: true,
  },
  {
    id: 'envUrls',
    section: 'Environments',
    question: 'Provide the application URL for each environment:',
    type: 'env-url-map',
    required: true,
    condition: (a) => a.projectType !== 'data',
    description: 'For each environment selected above, provide the base URL',
  },
  {
    id: 'envApiUrls',
    section: 'Environments',
    question: 'Provide the API base URL for each environment (if different from app URL):',
    type: 'env-url-map',
    required: false,
    condition: (a) => ['api', 'fullstack'].includes(a.projectType),
  },

  // --- Authentication ---
  {
    id: 'authMethod',
    section: 'Authentication',
    question: 'How do users authenticate with this application?',
    type: 'select',
    choices: AUTH_METHODS,
    descriptions: {
      none: 'No authentication required',
      basic: 'Username + password login form',
      oauth2: 'OAuth 2.0 / OpenID Connect',
      sso: 'Enterprise SSO (SAML, Okta, Azure AD)',
      'api-key': 'API key in header',
      jwt: 'JWT bearer token',
      custom: 'Custom authentication flow',
    },
    required: true,
  },
  {
    id: 'loginPagePath',
    section: 'Authentication',
    question: 'What is the login page path?',
    type: 'text',
    default: '/login',
    condition: (a) => ['basic', 'oauth2', 'sso', 'custom'].includes(a.authMethod) && a.projectType !== 'data' && a.projectType !== 'api',
  },
  {
    id: 'loginSelectors',
    section: 'Authentication',
    question: 'Provide CSS selectors for the login form (or leave blank to auto-discover):',
    type: 'object',
    fields: ['usernameField', 'passwordField', 'submitButton'],
    condition: (a) => a.authMethod === 'basic' && a.projectType !== 'data' && a.projectType !== 'api',
    required: false,
  },

  // --- Jira Integration ---
  {
    id: 'jiraProjectKey',
    section: 'Jira Integration',
    question: 'What is your Jira project key?',
    type: 'text',
    required: true,
    example: 'PORTAL',
  },
  {
    id: 'jiraAutoField',
    section: 'Jira Integration',
    question: 'What is the Jira custom field ID for the "Automate" flag?',
    type: 'text',
    default: 'customfield_10100',
    required: false,
  },

  // --- UI Testing ---
  {
    id: 'pages',
    section: 'UI Testing',
    question: 'List the key pages/flows to automate (name and path):',
    type: 'page-list',
    example: [{ name: 'Login', path: '/login' }, { name: 'Dashboard', path: '/dashboard' }],
    condition: (a) => ['web', 'fullstack'].includes(a.projectType),
    required: false,
  },
  {
    id: 'browsers',
    section: 'UI Testing',
    question: 'Which browsers should tests run on?',
    type: 'multi-select',
    choices: ['chromium', 'firefox', 'webkit'],
    default: ['chromium'],
    condition: (a) => ['web', 'fullstack'].includes(a.projectType),
  },

  // --- API Testing ---
  {
    id: 'apiEndpoints',
    section: 'API Testing',
    question: 'List key API endpoints to test (method, path, name):',
    type: 'endpoint-list',
    example: [{ name: 'Get Users', method: 'GET', path: '/api/users' }],
    condition: (a) => ['api', 'fullstack'].includes(a.projectType),
    required: false,
  },

  // --- Data Testing ---
  {
    id: 'dataSources',
    section: 'Data Platform',
    question: 'Which data sources does this project use?',
    type: 'datasource-list',
    choices: DATA_SOURCES,
    condition: (a) => ['data', 'fullstack'].includes(a.projectType),
    required: false,
  },
  {
    id: 'dataComparisons',
    section: 'Data Platform',
    question: 'Define source-to-target data comparison pairs:',
    type: 'comparison-list',
    condition: (a) => a.dataSources?.length > 0,
    required: false,
  },
  {
    id: 'calculations',
    section: 'Data Platform',
    question: 'Define calculation validations (formula checks on data):',
    type: 'calculation-list',
    condition: (a) => a.dataSources?.length > 0,
    required: false,
  },

  // --- Test Categories ---
  {
    id: 'testCategories',
    section: 'Test Strategy',
    question: 'Which test categories apply to this project?',
    type: 'multi-select',
    choices: TEST_CATEGORIES,
    default: ['regression', 'smoke'],
    required: true,
  },
];

export class OnboardingAgent {
  constructor() {
    this.answers = {};
    this.questions = ONBOARDING_QUESTIONS;
  }

  getApplicableQuestions(currentAnswers = {}) {
    return this.questions.filter((q) => {
      if (!q.condition) return true;
      return q.condition(currentAnswers);
    });
  }

  getNextUnansweredQuestion(currentAnswers = {}) {
    const applicable = this.getApplicableQuestions(currentAnswers);
    return applicable.find((q) => {
      if (!q.required && currentAnswers[q.id] === undefined) return true;
      if (q.required && (currentAnswers[q.id] === undefined || currentAnswers[q.id] === '')) return true;
      return false;
    });
  }

  validateAnswer(questionId, value) {
    const question = this.questions.find((q) => q.id === questionId);
    if (!question) return { valid: false, error: 'Unknown question' };

    if (question.required && (value === undefined || value === '' || value === null)) {
      return { valid: false, error: `${question.question} is required` };
    }

    if (question.validate) {
      const result = question.validate(value);
      if (result !== true) return { valid: false, error: result };
    }

    if (question.type === 'select' && question.choices && !question.choices.includes(value)) {
      return { valid: false, error: `Must be one of: ${question.choices.join(', ')}` };
    }

    return { valid: true };
  }

  setAnswers(answers) {
    this.answers = { ...this.answers, ...answers };
  }

  generateProjectConfig() {
    const cfg = createDefaultConfig(this.answers);
    const validation = validateProjectConfig(cfg);
    if (!validation.valid) {
      log.warn('Generated config has validation errors', { errors: validation.errors });
    }
    return { config: cfg, validation };
  }

  async scaffoldProject(outputDir, projectConfig) {
    log.info(`Scaffolding project "${projectConfig.project.name}" at ${outputDir}`);

    const dirs = [
      'tests/ui', 'tests/api', 'tests/data', 'tests/generated',
      'tests/smoke', 'tests/regression', 'tests/e2e',
      'src/pages', 'reports', 'locator-snapshots',
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(outputDir, dir), { recursive: true });
    }

    await this._writeProjectConfig(outputDir, projectConfig);
    await this._writeEnvFiles(outputDir, projectConfig);
    await this._writePlaywrightConfig(outputDir, projectConfig);
    await this._writePackageJson(outputDir, projectConfig);
    await this._writeGitignore(outputDir);

    if (['web', 'fullstack'].includes(projectConfig.project.type)) {
      await this._writeLoginPage(outputDir, projectConfig);
      await this._writePageStubs(outputDir, projectConfig);
      await this._writeUiTestStubs(outputDir, projectConfig);
    }

    if (['api', 'fullstack'].includes(projectConfig.project.type)) {
      await this._writeApiTestStubs(outputDir, projectConfig);
    }

    if (['data', 'fullstack'].includes(projectConfig.project.type)) {
      await this._writeDataTestStubs(outputDir, projectConfig);
    }

    await this._writeSmokeTest(outputDir, projectConfig);

    log.info('Project scaffolding complete');
    return { outputDir, project: projectConfig.project };
  }

  async _writeProjectConfig(dir, cfg) {
    const content = `/** @type {import('agent-playwright-framework').ProjectConfig} */\nexport default ${JSON.stringify(cfg, null, 2)};\n`;
    await fs.writeFile(path.join(dir, 'project.config.js'), content);
  }

  async _writeEnvFiles(dir, cfg) {
    for (const [envName, env] of Object.entries(cfg.environments)) {
      const lines = [
        `# ${cfg.project.name} - ${envName} environment`,
        `TEST_ENV=${envName}`,
        '',
        `APP_BASE_URL=${env.appUrl}`,
      ];

      if (env.apiUrl) lines.push(`APP_API_BASE_URL=${env.apiUrl}`);

      if (env.auth?.credentials) {
        lines.push('', '# Authentication');
        for (const [key, envVar] of Object.entries(env.auth.credentials)) {
          lines.push(`${envVar}=`);
        }
      }

      for (const ds of env.dataSources || []) {
        lines.push('', `# ${ds.name} (${ds.type})`);
        const prefix = ds.connectionEnvPrefix;
        if (ds.type === 'snowflake') {
          lines.push(`${prefix}_ACCOUNT=`, `${prefix}_USERNAME=`, `${prefix}_PASSWORD=`,
            `${prefix}_DATABASE=`, `${prefix}_SCHEMA=`, `${prefix}_WAREHOUSE=`, `${prefix}_ROLE=`);
        } else if (ds.type === 'databricks') {
          lines.push(`${prefix}_HOST=`, `${prefix}_TOKEN=`, `${prefix}_HTTP_PATH=`);
        } else {
          lines.push(`${prefix}_HOST=`, `${prefix}_PORT=`, `${prefix}_USER=`,
            `${prefix}_PASSWORD=`, `${prefix}_DATABASE=`);
        }
      }

      lines.push('', '# Jira', `JIRA_PROJECT_KEY=${cfg.jira.projectKey}`,
        `JIRA_AUTO_FIELD=${cfg.jira.autoField || 'customfield_10100'}`);

      await fs.writeFile(path.join(dir, `.env.${envName}.example`), lines.join('\n') + '\n');
    }
  }

  async _writePlaywrightConfig(dir, cfg) {
    const browsers = cfg.testing.browsers || ['chromium'];
    const projectBlocks = browsers.map((b) => `    { name: '${b}', use: { ...devices['${this._deviceName(b)}'] } },`).join('\n');

    const content = `import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

const env = process.env.TEST_ENV || 'dev';
dotenv.config({ path: \`.env.\${env}\` });

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['html', { outputFolder: \`reports/\${env}/html\`, open: 'never' }],
    ['json', { outputFile: \`reports/\${env}/results.json\` }],
    ['list'],
  ],

  use: {
    baseURL: process.env.APP_BASE_URL || '${cfg.environments[Object.keys(cfg.environments)[0]]?.appUrl || 'http://localhost:3000'}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  metadata: { environment: env, project: '${cfg.project.key}' },

  projects: [
${projectBlocks}
    { name: 'api', testDir: './tests/api', use: { baseURL: process.env.APP_API_BASE_URL || process.env.APP_BASE_URL } },
    { name: 'data', testDir: './tests/data', timeout: 120_000 },
  ],
});
`;
    await fs.writeFile(path.join(dir, 'playwright.config.js'), content);
  }

  async _writePackageJson(dir, cfg) {
    const pkg = {
      name: `${cfg.project.key}-tests`,
      version: '1.0.0',
      description: `Test automation for ${cfg.project.name}`,
      type: 'module',
      scripts: {
        test: 'npx playwright test',
        'test:smoke': 'npx playwright test tests/smoke/',
        'test:regression': 'npx playwright test tests/regression/',
      },
      dependencies: {
        'agent-playwright-framework': 'file:../../',
        '@playwright/test': '^1.48.0',
        dotenv: '^16.4.0',
      },
    };

    const envNames = Object.keys(cfg.environments);
    for (const envName of envNames) {
      pkg.scripts[`test:${envName}`] = `TEST_ENV=${envName} npx playwright test`;
      if (['web', 'fullstack'].includes(cfg.project.type)) {
        pkg.scripts[`test:${envName}:ui`] = `TEST_ENV=${envName} npx playwright test tests/ui/`;
      }
      if (['api', 'fullstack'].includes(cfg.project.type)) {
        pkg.scripts[`test:${envName}:api`] = `TEST_ENV=${envName} npx playwright test tests/api/`;
      }
      if (['data', 'fullstack'].includes(cfg.project.type)) {
        pkg.scripts[`test:${envName}:data`] = `TEST_ENV=${envName} npx playwright test tests/data/`;
      }
      pkg.scripts[`orchestrate:${envName}`] = `TEST_ENV=${envName} node node_modules/agent-playwright-framework/src/agents/orchestrator.js`;
    }

    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  }

  async _writeGitignore(dir) {
    await fs.writeFile(path.join(dir, '.gitignore'),
      'node_modules/\n.env.*\n!.env.*.example\nreports/\ntest-results/\nplaywright-report/\nlocator-snapshots/*.json\ntests/generated/*.spec.js\n*.log\n');
  }

  async _writeLoginPage(dir, cfg) {
    const firstEnv = Object.values(cfg.environments)[0];
    if (firstEnv?.auth?.method === 'none') return;

    const content = `import { BasePage } from 'agent-playwright-framework/src/pages/base-page.js';

export class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.url = '${this.answers.loginPagePath || '/login'}';
    this.locators = {
      usernameField: '${this.answers.loginSelectors?.usernameField || '#username'}',
      passwordField: '${this.answers.loginSelectors?.passwordField || '#password'}',
      submitButton: '${this.answers.loginSelectors?.submitButton || 'button[type="submit"]'}',
      errorMessage: '.error-message',
    };
  }

  async navigate() {
    await super.navigate(this.url);
  }

  async login(username, password) {
    await this.fill(this.locators.usernameField, username);
    await this.fill(this.locators.passwordField, password);
    await this.click(this.locators.submitButton);
  }

  async getError() {
    return this.getText(this.locators.errorMessage);
  }
}

export default LoginPage;
`;
    await fs.writeFile(path.join(dir, 'src/pages/login-page.js'), content);
  }

  async _writePageStubs(dir, cfg) {
    for (const page of cfg.testing.pages || []) {
      const className = this._toPascalCase(page.name) + 'Page';
      const fileName = page.name.toLowerCase().replace(/\s+/g, '-') + '-page.js';
      const content = `import { BasePage } from 'agent-playwright-framework/src/pages/base-page.js';

export class ${className} extends BasePage {
  constructor(page) {
    super(page);
    this.url = '${page.path}';
    this.locators = {};
  }

  async navigate() {
    await super.navigate(this.url);
  }
}

export default ${className};
`;
      await fs.writeFile(path.join(dir, 'src/pages', fileName), content);
    }
  }

  async _writeUiTestStubs(dir, cfg) {
    for (const page of cfg.testing.pages || []) {
      const className = this._toPascalCase(page.name) + 'Page';
      const fileName = page.name.toLowerCase().replace(/\s+/g, '-') + '.spec.js';
      const importPath = `../../src/pages/${page.name.toLowerCase().replace(/\s+/g, '-')}-page.js`;

      const content = `import { test, expect } from '@playwright/test';
import { ${className} } from '${importPath}';

test.describe('${page.name}', () => {
  let pageObj;

  test.beforeEach(async ({ page }) => {
    pageObj = new ${className}(page);
    await pageObj.navigate();
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp('${page.path.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}'));
  });

  test('key elements are visible', async ({ page }) => {
    await pageObj.waitForReady();
    const title = await pageObj.getTitle();
    expect(title).toBeTruthy();
  });
});
`;
      await fs.writeFile(path.join(dir, 'tests/ui', fileName), content);
    }
  }

  async _writeApiTestStubs(dir, cfg) {
    if (!cfg.testing.apiEndpoints?.length) return;
    const tests = cfg.testing.apiEndpoints.map((ep) => `
  test('${ep.method} ${ep.path} - ${ep.name}', async () => {
    const response = await api.${ep.method.toLowerCase()}('${ep.path}');
    expect(response.status).toBeLessThan(500);
  });`).join('\n');

    const content = `import { test, expect } from '@playwright/test';
import { ApiConnector } from 'agent-playwright-framework/src/connectors/api-connector.js';

test.describe('API Tests - ${cfg.project.name}', () => {
  let api;

  test.beforeAll(async () => {
    api = new ApiConnector(process.env.APP_API_BASE_URL || process.env.APP_BASE_URL);
  });
${tests}
});
`;
    await fs.writeFile(path.join(dir, 'tests/api/endpoints.spec.js'), content);
  }

  async _writeDataTestStubs(dir, cfg) {
    if (!cfg.testing.dataComparisons?.length && !cfg.testing.calculations?.length) return;

    let imports = `import { test, expect } from '@playwright/test';\nimport { DataComparisonAgent } from 'agent-playwright-framework/src/agents/data-comparison-agent/index.js';\n`;
    let tests = '';

    for (const comp of cfg.testing.dataComparisons || []) {
      tests += `
  test('${comp.name}: ${comp.sourceTable} vs ${comp.targetTable}', async () => {
    const result = await agent.compareData(
      'SELECT * FROM ${comp.sourceTable}',
      'SELECT * FROM ${comp.targetTable}',
      {
        keyColumns: ${JSON.stringify(comp.keyColumns)},
        ${comp.compareColumns ? `compareColumns: ${JSON.stringify(comp.compareColumns)},` : ''}
        tolerance: ${comp.tolerance || 0},
      }
    );
    expect(result.passed).toBe(true);
  });
`;
    }

    for (const calc of cfg.testing.calculations || []) {
      tests += `
  test('${calc.name}: validate ${calc.resultColumn}', async () => {
    const result = await agent.validateCalculation(
      'SELECT ${[...calc.inputColumns, calc.resultColumn].join(', ')} FROM ${calc.table}',
      '${calc.dataSources?.[0]?.type || 'snowflake'}',
      {
        resultColumn: '${calc.resultColumn}',
        inputColumns: ${JSON.stringify(calc.inputColumns)},
        formula: ${calc.formula},
        tolerance: ${calc.tolerance || 0.01},
      }
    );
    expect(result.passed).toBe(true);
  });
`;
    }

    const content = `${imports}
test.describe('Data Validation - ${cfg.project.name}', () => {
  const agent = new DataComparisonAgent();

  test.beforeAll(async () => {
    await agent.initConnections({ useSnowflake: true });
  });

  test.afterAll(async () => {
    await agent.closeConnections();
  });
${tests}
});
`;
    await fs.writeFile(path.join(dir, 'tests/data/validations.spec.js'), content);
  }

  async _writeSmokeTest(dir, cfg) {
    let body;
    if (['web', 'fullstack'].includes(cfg.project.type)) {
      body = `  test('application is reachable', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBeLessThan(400);
  });

  test('page has a title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
  });`;
    } else if (cfg.project.type === 'api') {
      body = `  test('API health check', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBeLessThan(500);
  });`;
    } else {
      body = `  test('framework is configured', async () => {
    expect(process.env.TEST_ENV).toBeTruthy();
  });`;
    }

    const content = `import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - ${cfg.project.name}', () => {
${body}
});
`;
    await fs.writeFile(path.join(dir, 'tests/smoke/smoke.spec.js'), content);
  }

  _toPascalCase(str) {
    return str.replace(/(^|[\s-_]+)(.)/g, (_, __, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
  }

  _deviceName(browser) {
    const map = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' };
    return map[browser] || 'Desktop Chrome';
  }
}

export default OnboardingAgent;
