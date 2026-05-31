const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const VALID_ENVS = ['dev', 'uat', 'buat'];

function resolveEnvName() {
  const raw = (process.env.TEST_ENV || 'dev').toLowerCase();
  if (!VALID_ENVS.includes(raw)) {
    throw new Error(
      `Invalid TEST_ENV="${raw}". Expected one of: ${VALID_ENVS.join(', ')}`,
    );
  }
  return raw;
}

function loadDotenvFor(envName) {
  const root = path.resolve(__dirname, '..');
  const envFile = path.join(root, `.env.${envName}`);
  const fallback = path.join(root, '.env');

  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  } else if (fs.existsSync(fallback)) {
    dotenv.config({ path: fallback });
  }
}

function required(key, value) {
  if (!value || String(value).trim() === '') {
    throw new Error(
      `Missing required env var "${key}". Set it in .env.${process.env.TEST_ENV || 'dev'} ` +
        `or export it before running tests.`,
    );
  }
  return value;
}

function optional(value) {
  return value && String(value).trim() !== '' ? value : undefined;
}

let cached;

/**
 * Load and validate the active environment.
 * Returns a frozen config object that the rest of the framework reads from.
 */
function loadEnv() {
  if (cached) return cached;

  const name = resolveEnvName();
  loadDotenvFor(name);

  cached = Object.freeze({
    name,
    apiBaseUrl: required('API_BASE_URL', process.env.API_BASE_URL),
    authBaseUrl: process.env.AUTH_BASE_URL || process.env.API_BASE_URL || '',
    auth: {
      loginPath: process.env.AUTH_LOGIN_PATH || '/siteminder/login',
      username: process.env.AUTH_USERNAME || '',
      password: process.env.AUTH_PASSWORD || '',
      smSession: optional(process.env.SM_SESSION),
    },
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 30_000),
    retryCount: Number(process.env.RETRY_COUNT || 1),
    databricks: {
      host: optional(process.env.DATABRICKS_HOST),
      httpPath: optional(process.env.DATABRICKS_HTTP_PATH),
      token: optional(process.env.DATABRICKS_TOKEN),
      catalog: optional(process.env.DATABRICKS_CATALOG),
      schema: optional(process.env.DATABRICKS_SCHEMA),
    },
    snowflake: {
      account: optional(process.env.SNOWFLAKE_ACCOUNT),
      username: optional(process.env.SNOWFLAKE_USERNAME),
      password: optional(process.env.SNOWFLAKE_PASSWORD),
      warehouse: optional(process.env.SNOWFLAKE_WAREHOUSE),
      database: optional(process.env.SNOWFLAKE_DATABASE),
      schema: optional(process.env.SNOWFLAKE_SCHEMA),
      role: optional(process.env.SNOWFLAKE_ROLE),
    },
    updateBaselines:
      (process.env.UPDATE_BASELINES || 'false').toLowerCase() === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  return cached;
}

function resetEnvCache() {
  cached = undefined;
}

module.exports = { loadEnv, resetEnvCache, VALID_ENVS };
