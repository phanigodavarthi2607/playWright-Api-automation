import snowflake from 'snowflake-sdk';
import config from '../core/config.js';
import { createAgentLogger } from '../core/logger.js';

const log = createAgentLogger('SnowflakeConnector');

export class SnowflakeConnector {
  constructor(overrides = {}) {
    this.config = { ...config.snowflake, ...overrides };
    this.connection = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection({
        account: this.config.account,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        schema: this.config.schema,
        warehouse: this.config.warehouse,
        role: this.config.role,
      });

      this.connection.connect((err, conn) => {
        if (err) {
          log.error('Snowflake connection failed', { error: err.message });
          reject(err);
        } else {
          log.info('Connected to Snowflake');
          resolve(conn);
        }
      });
    });
  }

  async execute(sql, binds = []) {
    if (!this.connection) await this.connect();

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: sql,
        binds,
        complete: (err, stmt, rows) => {
          if (err) {
            log.error('Query failed', { sql: sql.substring(0, 100), error: err.message });
            reject(err);
          } else {
            log.info(`Query returned ${rows.length} rows`);
            resolve(rows);
          }
        },
      });
    });
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
    return rows[0]?.CNT || rows[0]?.cnt || 0;
  }

  async disconnect() {
    if (!this.connection) return;
    return new Promise((resolve) => {
      this.connection.destroy((err) => {
        if (err) log.warn('Snowflake disconnect error', { error: err.message });
        else log.info('Disconnected from Snowflake');
        this.connection = null;
        resolve();
      });
    });
  }
}

export default SnowflakeConnector;
