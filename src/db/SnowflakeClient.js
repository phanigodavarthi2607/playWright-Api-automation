const { loadEnv } = require('../../config/env');
const { logger } = require('../utils/logger');

/**
 * Lazy-loaded wrapper around snowflake-sdk.
 * The dependency is declared as `optionalDependencies`.
 */
class SnowflakeClient {
  constructor() {
    this.connection = undefined;
  }

  static async connect() {
    const env = loadEnv();
    const sf = env.snowflake;

    if (!sf.account || !sf.username || !sf.password) {
      throw new Error(
        'Snowflake env is incomplete. Set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME and SNOWFLAKE_PASSWORD.',
      );
    }

    let sdk;
    try {
      sdk = require('snowflake-sdk');
    } catch {
      throw new Error(
        'snowflake-sdk is not installed. Run `npm install snowflake-sdk` to enable Snowflake tests.',
      );
    }

    const driver = sdk.default || sdk;
    const connection = driver.createConnection({
      account: sf.account,
      username: sf.username,
      password: sf.password,
      warehouse: sf.warehouse,
      database: sf.database,
      schema: sf.schema,
      role: sf.role,
    });

    logger.info(`Connecting to Snowflake ${sf.account} ...`);
    await new Promise((resolve, reject) => {
      connection.connect((err) => (err ? reject(err) : resolve()));
    });

    const instance = new SnowflakeClient();
    instance.connection = connection;
    return instance;
  }

  async query(sql, binds) {
    if (!this.connection) throw new Error('SnowflakeClient is not connected.');
    logger.debug(`[snowflake] ${sql}`);
    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: sql,
        binds,
        complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows || [])),
      });
    });
  }

  async close() {
    if (!this.connection) return;
    const conn = this.connection;
    this.connection = undefined;
    await new Promise((resolve) => conn.destroy(() => resolve()));
  }
}

module.exports = { SnowflakeClient };
