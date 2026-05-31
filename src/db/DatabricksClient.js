const { loadEnv } = require('../../config/env');
const { logger } = require('../utils/logger');

/**
 * Lazy-loaded wrapper around @databricks/sql.
 *
 * The dependency is declared as `optionalDependencies`, so a clear error is
 * thrown only when `connect()` is actually called without it installed.
 */
class DatabricksClient {
  constructor() {
    this.session = undefined;
    this.connection = undefined;
  }

  static async connect() {
    const env = loadEnv();
    const { host, httpPath, token } = env.databricks;

    if (!host || !httpPath || !token) {
      throw new Error(
        'Databricks env is incomplete. Set DATABRICKS_HOST, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN.',
      );
    }

    let sdk;
    try {
      sdk = require('@databricks/sql');
    } catch {
      throw new Error(
        '@databricks/sql is not installed. Run `npm install @databricks/sql` to enable Databricks tests.',
      );
    }

    const DBSQLClient =
      sdk.DBSQLClient || (sdk.default && sdk.default.DBSQLClient) || sdk.default;
    const client = new DBSQLClient();

    logger.info(`Connecting to Databricks ${host} ...`);
    const connection = await client.connect({ host, path: httpPath, token });
    const session = await connection.openSession();

    const instance = new DatabricksClient();
    instance.session = session;
    instance.connection = connection;
    return instance;
  }

  async query(sql) {
    if (!this.session) throw new Error('DatabricksClient is not connected.');
    logger.debug(`[databricks] ${sql}`);
    const op = await this.session.executeStatement(sql, { runAsync: true });
    const rows = await op.fetchAll();
    await op.close();
    return rows;
  }

  async close() {
    if (this.session) await this.session.close().catch(() => undefined);
    if (this.connection) await this.connection.close().catch(() => undefined);
    this.session = undefined;
    this.connection = undefined;
  }
}

module.exports = { DatabricksClient };
