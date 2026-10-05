import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';

const log = createAgentLogger('CodingAgent');

const TEST_TEMPLATE = `import { test, expect } from '@playwright/test';
{{#if imports}}
{{{imports}}}
{{/if}}

test.describe('{{suiteName}}', () => {
  {{#if beforeEach}}
  test.beforeEach(async ({ page }) => {
    {{{beforeEach}}}
  });

  {{/if}}
  {{#each tests}}
  test('{{this.name}}', async ({ {{this.fixtures}} }) => {
    {{{this.body}}}
  });

  {{/each}}
});
`;

const PAGE_OBJECT_TEMPLATE = `import { BasePage } from '../../src/pages/base-page.js';

export class {{className}} extends BasePage {
  constructor(page) {
    super(page);
    this.url = '{{url}}';
    this.locators = {
      {{#each locators}}
      {{this.name}}: '{{this.selector}}',
      {{/each}}
    };
  }

  async navigate() {
    await super.navigate(this.url);
  }

  {{#each methods}}
  async {{this.name}}({{this.params}}) {
    {{{this.body}}}
  }

  {{/each}}
}

export default {{className}};
`;

const API_TEST_TEMPLATE = `import { test, expect } from '@playwright/test';
import { ApiConnector } from '../../src/connectors/api-connector.js';

test.describe('{{suiteName}}', () => {
  let api;

  test.beforeAll(async () => {
    api = new ApiConnector();
  });

  {{#each tests}}
  test('{{this.name}}', async () => {
    {{{this.body}}}
  });

  {{/each}}
});
`;

const DATA_TEST_TEMPLATE = `import { test, expect } from '@playwright/test';
import { SnowflakeConnector } from '../../src/connectors/snowflake-connector.js';
import { DatabricksConnector } from '../../src/connectors/databricks-connector.js';

test.describe('{{suiteName}}', () => {
  let snowflake, databricks;

  test.beforeAll(async () => {
    {{#if useSnowflake}}
    snowflake = new SnowflakeConnector();
    await snowflake.connect();
    {{/if}}
    {{#if useDatabricks}}
    databricks = new DatabricksConnector();
    await databricks.connect();
    {{/if}}
  });

  test.afterAll(async () => {
    {{#if useSnowflake}}
    await snowflake?.disconnect();
    {{/if}}
    {{#if useDatabricks}}
    await databricks?.disconnect();
    {{/if}}
  });

  {{#each tests}}
  test('{{this.name}}', async () => {
    {{{this.body}}}
  });

  {{/each}}
});
`;

export class CodingAgent {
  constructor() {
    this.templates = {
      ui: Handlebars.compile(TEST_TEMPLATE),
      pageObject: Handlebars.compile(PAGE_OBJECT_TEMPLATE),
      api: Handlebars.compile(API_TEST_TEMPLATE),
      data: Handlebars.compile(DATA_TEST_TEMPLATE),
    };
  }

  async generateFromScenarios(scenarios, options = {}) {
    const results = [];

    for (const scenario of scenarios) {
      const type = scenario.type || 'ui';
      const result = await this._generateTest(scenario, type, options);
      results.push(result);
    }

    log.info(`Generated ${results.length} test files`);
    return results;
  }

  async generateFromStory(story) {
    if (!story.testScenarios?.length) {
      log.warn(`No test scenarios for story ${story.key}`);
      return [];
    }

    const results = [];
    const grouped = this._groupByType(story.testScenarios);

    for (const [type, scenarios] of Object.entries(grouped)) {
      const suiteName = `${story.key}: ${story.summary}`;
      const tests = scenarios.map((s) => this._scenarioToTest(s, type));
      const content = this._renderTemplate(type, { suiteName, tests, story });

      const fileName = `${story.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${type}.spec.js`;
      const filePath = path.join(config.paths.generatedTests, fileName);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);

      results.push({ file: filePath, type, testCount: tests.length, story: story.key });
      log.info(`Generated ${filePath} with ${tests.length} tests`);
    }

    return results;
  }

  async generatePageObject(pageInfo) {
    const content = this.templates.pageObject({
      className: pageInfo.className,
      url: pageInfo.url,
      locators: pageInfo.locators || [],
      methods: pageInfo.methods || [],
    });

    const fileName = `${pageInfo.className.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)}.js`;
    const filePath = path.join(config.paths.pages, fileName);

    await fs.writeFile(filePath, content);
    log.info(`Generated page object: ${filePath}`);
    return filePath;
  }

  _generateTest(scenario, type, options) {
    const test = this._scenarioToTest(scenario, type);
    const suiteName = options.suiteName || scenario.name;

    return {
      content: this._renderTemplate(type, {
        suiteName,
        tests: [test],
        ...options,
      }),
      test,
      type,
    };
  }

  _scenarioToTest(scenario, type) {
    const fixtures = type === 'ui' ? 'page' : '';
    const body = this._generateTestBody(scenario, type);

    return {
      name: scenario.name,
      fixtures,
      body,
    };
  }

  _generateTestBody(scenario, type) {
    const lines = [];

    if (type === 'ui') {
      lines.push(...this._generateUITestBody(scenario));
    } else if (type === 'api') {
      lines.push(...this._generateAPITestBody(scenario));
    } else if (type === 'data' || type === 'calculation') {
      lines.push(...this._generateDataTestBody(scenario));
    } else {
      lines.push(...this._generateFunctionalTestBody(scenario));
    }

    return lines.join('\n    ');
  }

  _generateUITestBody(scenario) {
    const lines = [];

    for (const step of scenario.steps || []) {
      if (step.keyword === 'given') {
        lines.push(`// Given: ${step.text || step.detail}`);
        lines.push(`await page.goto('/');`);
      } else if (step.keyword === 'when') {
        lines.push(`// When: ${step.text || step.detail}`);
        lines.push(`// TODO: Implement action - ${step.text || step.detail}`);
      } else if (step.keyword === 'then') {
        lines.push(`// Then: ${step.text || step.detail}`);
        lines.push(`// TODO: Add assertion - ${step.text || step.detail}`);
      } else {
        lines.push(`// Step: ${step.detail || step.text}`);
        lines.push(`// TODO: Implement - ${step.detail || step.text}`);
      }
    }

    if (lines.length === 0) {
      lines.push(`await page.goto('/');`);
      lines.push(`// TODO: Implement test for "${scenario.name}"`);
    }

    return lines;
  }

  _generateAPITestBody(scenario) {
    const lines = [];
    lines.push(`const response = await api.get('/endpoint');`);
    lines.push(`expect(response.status).toBe(200);`);

    for (const step of scenario.steps || []) {
      lines.push(`// Verify: ${step.detail || step.text}`);
    }

    return lines;
  }

  _generateDataTestBody(scenario) {
    const lines = [];
    lines.push(`// Data validation: ${scenario.name}`);
    lines.push(`const sourceData = await snowflake.execute('SELECT * FROM source_table LIMIT 10');`);
    lines.push(`const targetData = await snowflake.execute('SELECT * FROM target_table LIMIT 10');`);
    lines.push(`expect(sourceData.length).toBe(targetData.length);`);

    for (const step of scenario.steps || []) {
      lines.push(`// Verify: ${step.detail || step.text}`);
    }

    return lines;
  }

  _generateFunctionalTestBody(scenario) {
    const lines = [];
    lines.push(`// Functional test: ${scenario.name}`);

    for (const step of scenario.steps || []) {
      lines.push(`// ${step.action}: ${step.detail || step.text}`);
    }

    lines.push(`// TODO: Complete implementation`);
    return lines;
  }

  _renderTemplate(type, data) {
    if (type === 'api') return this.templates.api(data);
    if (type === 'data' || type === 'calculation') {
      return this.templates.data({ ...data, useSnowflake: true, useDatabricks: false });
    }
    return this.templates.ui(data);
  }

  _groupByType(scenarios) {
    const grouped = {};
    for (const scenario of scenarios) {
      const type = scenario.type || 'functional';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(scenario);
    }
    return grouped;
  }
}

export default CodingAgent;

if (process.argv[1] && process.argv[1].includes('coding-agent')) {
  const agent = new CodingAgent();
  log.info('Coding Agent ready - awaiting scenarios from orchestrator');
}
