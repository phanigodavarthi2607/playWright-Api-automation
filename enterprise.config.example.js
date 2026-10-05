/**
 * Enterprise-wide configuration template.
 *
 * Copy this file to `enterprise.config.js` and customise for your organisation.
 * The Onboarding Agent validates new projects against these standards, and the
 * Enterprise Manager uses them for cross-project reporting.
 */

/** @type {import('./src/enterprise/manager.js').OrgConfig} */
export default {
  organization: {
    name: 'Your Organisation',
    jiraBaseUrl: 'https://your-org.atlassian.net',
    jiraEmail: 'automation@your-org.com',
  },

  standards: {
    mandatoryBrowsers: ['chromium'],
    mandatoryTestCategories: ['smoke', 'regression'],

    namingConvention: {
      testFiles: '{feature}.spec.js',
      pageObjects: '{page-name}-page.js',
      projectKeys: 'lowercase-with-hyphens',
    },

    locatorStrategy: ['data-testid', 'id', 'aria-label', 'role', 'text', 'css'],

    maxTestTimeout: 120_000,

    requiredEnvs: ['dev', 'uat', 'prod'],
  },

  sharedDataSources: {
    'enterprise-snowflake': {
      type: 'snowflake',
      description: 'Central Snowflake warehouse used across teams',
    },
    'enterprise-databricks': {
      type: 'databricks',
      description: 'Shared Databricks workspace',
    },
  },

  teams: [
    'Platform Engineering',
    'Data Engineering',
    'Frontend',
    'QA',
  ],

  reporting: {
    centralReportDir: './reports',
    retainHistoryDays: 90,
    notifyOnFailure: true,
  },
};
