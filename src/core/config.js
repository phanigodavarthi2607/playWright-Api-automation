import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

const config = {
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
    logLevel: process.env.AGENT_LOG_LEVEL || 'info',
    maxHealAttempts: parseInt(process.env.AGENT_MAX_HEAL_ATTEMPTS || '3', 10),
    locatorSimilarityThreshold: parseFloat(process.env.AGENT_LOCATOR_SIMILARITY_THRESHOLD || '0.7'),
    autoCommitFixes: process.env.AGENT_AUTO_COMMIT_FIXES === 'true',
  },

  paths: {
    tests: path.join(ROOT_DIR, 'tests'),
    generatedTests: path.join(ROOT_DIR, 'tests/generated'),
    reports: process.env.REPORT_OUTPUT_DIR || path.join(ROOT_DIR, 'reports'),
    locatorSnapshots: path.join(ROOT_DIR, 'locator-snapshots'),
    pages: path.join(ROOT_DIR, 'src/pages'),
    templates: path.join(ROOT_DIR, 'src/templates'),
    skills: path.join(ROOT_DIR, 'skills'),
  },
};

export default config;
