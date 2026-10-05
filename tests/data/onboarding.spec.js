import { test, expect } from '@playwright/test';
import { OnboardingAgent } from '../../src/agents/onboarding-agent/index.js';
import { validateProjectConfig } from '../../src/core/project-config-schema.js';
import { EnterpriseManager } from '../../src/enterprise/manager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '../../.test-output');

test.describe('Onboarding Agent - Project Scaffolding', () => {
  test.afterAll(async () => {
    await fs.rm(TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  });

  test('generates valid config for a fullstack project', () => {
    const agent = new OnboardingAgent();
    agent.setAnswers({
      projectName: 'Customer Portal',
      projectKey: 'cust-portal',
      projectType: 'fullstack',
      teamName: 'Platform Engineering',
      environments: ['dev', 'uat', 'prod'],
      devAppUrl: 'https://dev.portal.example.com',
      uatAppUrl: 'https://uat.portal.example.com',
      prodAppUrl: 'https://portal.example.com',
      authMethod: 'basic',
      jiraProjectKey: 'PORTAL',
      testCategories: ['ui', 'api', 'regression', 'smoke'],
    });

    const { config, validation } = agent.generateProjectConfig();

    expect(config.project.name).toBe('Customer Portal');
    expect(config.project.key).toBe('cust-portal');
    expect(config.project.type).toBe('fullstack');
    expect(Object.keys(config.environments)).toEqual(['dev', 'uat', 'prod']);
    expect(config.environments.dev.appUrl).toBe('https://dev.portal.example.com');
    expect(config.environments.uat.auth.method).toBe('basic');
    expect(config.jira.projectKey).toBe('PORTAL');
    expect(config.testing.categories).toContain('regression');
    expect(validation.valid).toBe(true);
  });

  test('generates valid config for a data-only project', () => {
    const agent = new OnboardingAgent();
    agent.setAnswers({
      projectName: 'DWH ETL Pipeline',
      projectKey: 'dwh-etl',
      projectType: 'data',
      teamName: 'Data Engineering',
      environments: ['dev', 'prod'],
      authMethod: 'none',
      jiraProjectKey: 'DWH',
      testCategories: ['data-comparison', 'calculation', 'etl', 'smoke'],
      dataSources: [{ name: 'Warehouse', type: 'snowflake' }],
      dataComparisons: [{
        name: 'Orders staging vs prod',
        sourceType: 'snowflake',
        sourceTable: 'staging.orders',
        targetType: 'snowflake',
        targetTable: 'prod.orders',
        keyColumns: ['order_id'],
      }],
    });

    const { config, validation } = agent.generateProjectConfig();
    expect(config.project.type).toBe('data');
    expect(config.testing.dataComparisons).toHaveLength(1);
    expect(validation.valid).toBe(true);
  });

  test('validates project config catches missing fields', () => {
    const result = validateProjectConfig({
      project: { name: '', key: '', type: 'invalid', team: '' },
      environments: {},
      jira: {},
      testing: { categories: [] },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('project.name'))).toBe(true);
    expect(result.errors.some((e) => e.includes('project.type'))).toBe(true);
  });

  test('scaffolds a web project with correct file structure', async () => {
    const agent = new OnboardingAgent();
    agent.setAnswers({
      projectName: 'Test App',
      projectKey: 'test-app',
      projectType: 'web',
      teamName: 'QA',
      environments: ['dev', 'uat'],
      devAppUrl: 'https://dev.test.com',
      uatAppUrl: 'https://uat.test.com',
      authMethod: 'basic',
      loginPagePath: '/login',
      jiraProjectKey: 'TEST',
      testCategories: ['ui', 'smoke'],
      pages: [
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Settings', path: '/settings' },
      ],
      browsers: ['chromium', 'firefox'],
    });

    const { config } = agent.generateProjectConfig();
    const outputDir = path.join(TEMP_DIR, 'test-app');
    await agent.scaffoldProject(outputDir, config);

    const exists = async (p) => {
      try { await fs.access(path.join(outputDir, p)); return true; }
      catch { return false; }
    };

    expect(await exists('project.config.js')).toBe(true);
    expect(await exists('playwright.config.js')).toBe(true);
    expect(await exists('package.json')).toBe(true);
    expect(await exists('.env.dev.example')).toBe(true);
    expect(await exists('.env.uat.example')).toBe(true);
    expect(await exists('src/pages/login-page.js')).toBe(true);
    expect(await exists('src/pages/dashboard-page.js')).toBe(true);
    expect(await exists('src/pages/settings-page.js')).toBe(true);
    expect(await exists('tests/ui/dashboard.spec.js')).toBe(true);
    expect(await exists('tests/ui/settings.spec.js')).toBe(true);
    expect(await exists('tests/smoke/smoke.spec.js')).toBe(true);

    const pkg = JSON.parse(await fs.readFile(path.join(outputDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['test:dev']).toBe('TEST_ENV=dev npx playwright test');
    expect(pkg.scripts['test:uat']).toBe('TEST_ENV=uat npx playwright test');
    expect(pkg.scripts['test:dev:ui']).toBeDefined();
  });

  test('filters questions based on project type', () => {
    const agent = new OnboardingAgent();

    const apiQuestions = agent.getApplicableQuestions({ projectType: 'api' });
    const apiIds = apiQuestions.map((q) => q.id);
    expect(apiIds).not.toContain('pages');
    expect(apiIds).not.toContain('browsers');

    const dataQuestions = agent.getApplicableQuestions({ projectType: 'data' });
    const dataIds = dataQuestions.map((q) => q.id);
    expect(dataIds).not.toContain('envUrls');
    expect(dataIds).not.toContain('loginPagePath');

    const fullstackQuestions = agent.getApplicableQuestions({ projectType: 'fullstack' });
    const fullstackIds = fullstackQuestions.map((q) => q.id);
    expect(fullstackIds).toContain('pages');
    expect(fullstackIds).toContain('apiEndpoints');
    expect(fullstackIds).toContain('dataSources');
  });

  test('enterprise manager validates standards compliance', async () => {
    const enterprise = new EnterpriseManager(TEMP_DIR);
    enterprise.config = {
      standards: {
        mandatoryBrowsers: ['chromium', 'firefox'],
        mandatoryTestCategories: ['smoke', 'regression'],
        requiredEnvs: ['dev', 'uat', 'prod'],
      },
    };

    const nonCompliant = enterprise.validateAgainstStandards({
      project: { key: 'test' },
      environments: { dev: {} },
      testing: { browsers: ['chromium'], categories: ['smoke'] },
    });

    expect(nonCompliant.compliant).toBe(false);
    expect(nonCompliant.violations).toContain('Missing mandatory browser: firefox');
    expect(nonCompliant.violations).toContain('Missing mandatory test category: regression');
    expect(nonCompliant.violations).toContain('Missing required environment: uat');
    expect(nonCompliant.violations).toContain('Missing required environment: prod');
  });
});
