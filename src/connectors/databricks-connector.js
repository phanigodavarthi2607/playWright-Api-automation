import { DBSQLClient } from 'databricks-sql-nodejs';
import config from '../core/config.js';
import { createAgentLogger } from '../core/logger.js';

const log = createAgentLogger('DatabricksConnector');

export class DatabricksConnector {
  constructor(overrides = {}) {
    this.config = { ...config.databricks, ...overrides };
    this.client = null;
    this.session = null;
  }

  async connect() {
    this.client = new DBSQLClient();
    const connection = await this.client.connect({
      host: this.config.host,
      path: this.config.httpPath,
      token: this.config.token,
    });
    this.session = await connection.openSession();
    log.info('Connected to Databricks');
    return this.session;
  }

  async execute(sql) {
    if (!this.session) await this.connect();
    log.info('Executing Databricks query', { sql: sql.substring(0, 100) });

    const operation = await this.session.executeStatement(sql);
    const result = await operation.fetchAll();
    await operation.close();

    log.info(`Query returned ${result.length} rows`);
    return result;
  }

  async getTableData(tableName, columns = '*', where = '', limit = 1000) {
    const cols = Array.isArray(columns) ? columns.join(', ') : columns;
    let sql = `SELECT ${cols} FROM ${tableName}`;
    if (where) sql += ` WHERE ${where}`;
    sql += ` LIMIT ${limit}`;
    return this.execute(sql);
  }

  async getRowCount(tableName, where = '') {
    let sql = `SELECT COUNT(*) AS cnt FROM ${tableName}`;
    if (where) sql += ` WHERE ${where}`;
    const rows = await this.execute(sql);
    return rows[0]?.cnt || 0;
  }

  async disconnect() {
    if (this.session) {
      await this.session.close().catch(() => {});
      this.session = null;
    }
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
    log.info('Disconnected from Databricks');
  }
}

export default DatabricksConnector;
