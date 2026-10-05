/**
 * Project configuration schema and validator.
 *
 * Every project onboarded into the framework gets a `project.config.js` at its
 * root.  The onboarding agent generates it from questionnaire answers; after
 * that every other agent reads it to know what to test, where, and how.
 */

export const PROJECT_TYPES = ['web', 'api', 'data', 'fullstack'];

export const AUTH_METHODS = ['none', 'basic', 'oauth2', 'sso', 'api-key', 'jwt', 'custom'];

export const DATA_SOURCES = ['snowflake', 'databricks', 'postgres', 'mysql', 'mssql', 'oracle', 'bigquery', 'redshift'];

export const TEST_CATEGORIES = ['ui', 'api', 'data-comparison', 'calculation', 'etl', 'regression', 'smoke', 'e2e'];

export const SCHEMA = {
  project: {
    name: { type: 'string', required: true, description: 'Project name (e.g. "Customer Portal")' },
    key: { type: 'string', required: true, description: 'Short key used in file names and reports (e.g. "cust-portal")' },
    type: { type: 'enum', values: PROJECT_TYPES, required: true, description: 'Primary project type' },
    team: { type: 'string', required: true, description: 'Owning team name' },
    description: { type: 'string', required: false },
  },

  environments: {
    _isMap: true,
    _description: 'Map of environment name -> environment config',
    _valueSchema: {
      appUrl: { type: 'string', required: true, description: 'Application base URL' },
      apiUrl: { type: 'string', required: false, description: 'API base URL (if different from app)' },
      auth: {
        method: { type: 'enum', values: AUTH_METHODS, required: true },
        credentials: { type: 'object', required: false, description: 'Env-var names for credentials (not values)' },
      },
      dataSources: {
        _isArray: true,
        _itemSchema: {
          name: { type: 'string', required: true },
          type: { type: 'enum', values: DATA_SOURCES, required: true },
          connectionEnvPrefix: { type: 'string', required: true, description: 'Env-var prefix (e.g. "SF_DEV")' },
        },
      },
    },
  },

  jira: {
    projectKey: { type: 'string', required: true },
    autoField: { type: 'string', required: false, default: 'customfield_10100' },
    testCaseIssueType: { type: 'string', required: false, default: 'Test' },
  },

  testing: {
    categories: { type: 'array', items: { type: 'enum', values: TEST_CATEGORIES }, required: true },
    browsers: { type: 'array', items: { type: 'string' }, required: false, default: ['chromium'] },
    pages: {
      _isArray: true,
      _description: 'Key application pages to generate page objects for',
      _itemSchema: {
        name: { type: 'string', required: true },
        path: { type: 'string', required: true },
        description: { type: 'string', required: false },
      },
    },
    apiEndpoints: {
      _isArray: true,
      _description: 'Key API endpoints to generate API tests for',
      _itemSchema: {
        name: { type: 'string', required: true },
        method: { type: 'string', required: true },
        path: { type: 'string', required: true },
        description: { type: 'string', required: false },
      },
    },
    dataComparisons: {
      _isArray: true,
      _description: 'Data comparison pairs',
      _itemSchema: {
        name: { type: 'string', required: true },
        sourceType: { type: 'enum', values: DATA_SOURCES, required: true },
        sourceTable: { type: 'string', required: true },
        targetType: { type: 'enum', values: DATA_SOURCES, required: true },
        targetTable: { type: 'string', required: true },
        keyColumns: { type: 'array', items: { type: 'string' }, required: true },
        compareColumns: { type: 'array', items: { type: 'string' }, required: false },
        tolerance: { type: 'number', required: false, default: 0 },
      },
    },
    calculations: {
      _isArray: true,
      _description: 'Calculation validations',
      _itemSchema: {
        name: { type: 'string', required: true },
        table: { type: 'string', required: true },
        resultColumn: { type: 'string', required: true },
        inputColumns: { type: 'array', items: { type: 'string' }, required: true },
        formula: { type: 'string', required: true, description: 'JS formula string, e.g. "(a, b) => a * b"' },
        tolerance: { type: 'number', required: false, default: 0.01 },
      },
    },
  },
};

export function validateProjectConfig(cfg) {
  const errors = [];

  if (!cfg.project?.name) errors.push('project.name is required');
  if (!cfg.project?.key) errors.push('project.key is required');
  if (!cfg.project?.type || !PROJECT_TYPES.includes(cfg.project.type)) {
    errors.push(`project.type must be one of: ${PROJECT_TYPES.join(', ')}`);
  }
  if (!cfg.project?.team) errors.push('project.team is required');

  if (!cfg.environments || Object.keys(cfg.environments).length === 0) {
    errors.push('At least one environment must be defined');
  } else {
    for (const [envName, env] of Object.entries(cfg.environments)) {
      if (!env.appUrl && cfg.project?.type !== 'data') {
        errors.push(`environments.${envName}.appUrl is required for non-data projects`);
      }
      if (!env.auth?.method) {
        errors.push(`environments.${envName}.auth.method is required`);
      }
    }
  }

  if (!cfg.jira?.projectKey) errors.push('jira.projectKey is required');

  if (!cfg.testing?.categories?.length) {
    errors.push('testing.categories must include at least one category');
  }

  return { valid: errors.length === 0, errors };
}

export function createDefaultConfig(answers) {
  return {
    project: {
      name: answers.projectName,
      key: answers.projectKey,
      type: answers.projectType,
      team: answers.teamName,
      description: answers.description || '',
    },

    environments: buildEnvironments(answers),

    jira: {
      projectKey: answers.jiraProjectKey,
      autoField: answers.jiraAutoField || 'customfield_10100',
      testCaseIssueType: answers.jiraTestCaseType || 'Test',
    },

    testing: {
      categories: answers.testCategories || ['ui', 'api'],
      browsers: answers.browsers || ['chromium'],
      pages: answers.pages || [],
      apiEndpoints: answers.apiEndpoints || [],
      dataComparisons: answers.dataComparisons || [],
      calculations: answers.calculations || [],
    },
  };
}

function buildEnvironments(answers) {
  const envs = {};
  const envNames = answers.environments || ['dev', 'uat', 'prod'];

  for (const envName of envNames) {
    envs[envName] = {
      appUrl: answers[`${envName}AppUrl`] || `https://${envName}.${answers.projectKey}.example.com`,
      apiUrl: answers[`${envName}ApiUrl`] || null,
      auth: {
        method: answers.authMethod || 'none',
        credentials: answers.authMethod !== 'none' ? {
          usernameEnv: `${answers.projectKey.toUpperCase().replace(/-/g, '_')}_${envName.toUpperCase()}_USERNAME`,
          passwordEnv: `${answers.projectKey.toUpperCase().replace(/-/g, '_')}_${envName.toUpperCase()}_PASSWORD`,
        } : {},
      },
      dataSources: (answers.dataSources || []).map((ds) => ({
        ...ds,
        connectionEnvPrefix: `${ds.type.toUpperCase()}_${envName.toUpperCase()}`,
      })),
    };
  }

  return envs;
}
