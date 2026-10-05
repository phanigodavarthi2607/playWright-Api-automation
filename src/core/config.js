import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

const VALID_ENVS = ['dev', 'uat', 'buat', 'prod'];

function resolveEnvironment() {
  const envName = process.env.TEST_ENV || '';

  const envFile = envName ? `.env.${envName}` : '.env';
  const envPath = path.join(ROOT_DIR, envFile);

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config({ path: path.join(ROOT_DIR, '.env') });
  }

  const resolved = process.env.TEST_ENV || 'dev';

  if (!VALID_ENVS.includes(resolved)) {
    console.warn(
      `[config] Unknown TEST_ENV="${resolved}". Valid values: ${VALID_ENVS.join(', ')}. Falling back to "dev".`
    );
    return 'dev';
  }

  return resolved;
}

const ENV = resolveEnvironment();

const ENV_DEFAULTS = {
  dev: {
    logLevel: 'debug',
    maxHealAttempts: 3,
    locatorSimilarityThreshold: 0.7,
    playwrightRetries: 1,
    playwrightWorkers: undefined,
    playwrightTimeout: 60_000,
  },
  uat: {
    logLevel: 'info',
    maxHealAttempts: 3,
    locatorSimilarityThreshold: 0.7,
    playwrightRetries: 2,
    playwrightWorkers: 2,
    playwrightTimeout: 90_000,
  },
  buat: {
    logLevel: 'info',
    maxHealAttempts: 3,
    locatorSimilarityThreshold: 0.7,
    playwrightRetries: 2,
    playwrightWorkers: 2,
    playwrightTimeout: 90_000,
  },
  prod: {
    logLevel: 'warn',
    maxHealAttempts: 1,
    locatorSimilarityThreshold: 0.9,
    playwrightRetries: 0,
    playwrightWorkers: 1,
    playwrightTimeout: 120_000,
  },
};

const defaults = ENV_DEFAULTS[ENV];
const reportBaseDir = process.env.REPORT_OUTPUT_DIR || path.join(ROOT_DIR, 'reports');
const reportDir = reportBaseDir.endsWith(ENV) ? reportBaseDir : path.join(reportBaseDir, ENV);

const config = {
  env: ENV,
  rootDir: ROOT_DIR,

  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    projectKey: process.env.JIRA_PROJECT_KEY,
    autoField: process.env.JIRA_AUTO_FIELD || 'customfield_10100',
  },

  snowflake: {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    role: process.env.SNOWFLAKE_ROLE,
  },

  databricks: {
    host: process.env.DATABRICKS_HOST,
    token: process.env.DATABRICKS_TOKEN,
    httpPath: process.env.DATABRICKS_HTTP_PATH,
  },

  app: {
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    apiBaseUrl: process.env.APP_API_BASE_URL || 'http://localhost:3000/api',
    username: process.env.APP_USERNAME,
    password: process.env.APP_PASSWORD,
  },

  agent: {
    logLevel: process.env.AGENT_LOG_LEVEL || defaults.logLevel,
    maxHealAttempts: parseInt(process.env.AGENT_MAX_HEAL_ATTEMPTS || String(defaults.maxHealAttempts), 10),
    locatorSimilarityThreshold: parseFloat(
      process.env.AGENT_LOCATOR_SIMILARITY_THRESHOLD || String(defaults.locatorSimilarityThreshold)
    ),
    autoCommitFixes: process.env.AGENT_AUTO_COMMIT_FIXES === 'true',
  },

  playwright: {
    retries: defaults.playwrightRetries,
    workers: defaults.playwrightWorkers,
    timeout: defaults.playwrightTimeout,
  },

  paths: {
    tests: path.join(ROOT_DIR, 'tests'),
    generatedTests: path.join(ROOT_DIR, 'tests/generated'),
    reports: reportDir,
    locatorSnapshots: path.join(ROOT_DIR, 'locator-snapshots'),
    pages: path.join(ROOT_DIR, 'src/pages'),
    templates: path.join(ROOT_DIR, 'src/templates'),
    skills: path.join(ROOT_DIR, 'skills'),
  },

  isEnv(name) {
    return ENV === name;
  },

  isProd() {
    return ENV === 'prod';
  },
};

export default config;
export { VALID_ENVS, ENV };
