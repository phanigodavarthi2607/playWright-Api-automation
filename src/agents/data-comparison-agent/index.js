import { createAgentLogger } from '../../core/logger.js';
import { SnowflakeConnector } from '../../connectors/snowflake-connector.js';
import { DatabricksConnector } from '../../connectors/databricks-connector.js';
import fs from 'fs/promises';
import path from 'path';
import config from '../../core/config.js';

const log = createAgentLogger('DataComparisonAgent');

export class DataComparisonAgent {
  constructor() {
    this.snowflake = null;
    this.databricks = null;
  }

  async initConnections({ useSnowflake = true, useDatabricks = false } = {}) {
    if (useSnowflake) {
      this.snowflake = new SnowflakeConnector();
      await this.snowflake.connect();
    }
    if (useDatabricks) {
      this.databricks = new DatabricksConnector();
      await this.databricks.connect();
    }
  }

  async closeConnections() {
    await this.snowflake?.disconnect();
    await this.databricks?.disconnect();
  }

  async compareRowCounts(sourceTable, targetTable, options = {}) {
    const { sourceConnector = 'snowflake', targetConnector = 'snowflake', where = '' } = options;
    log.info(`Comparing row counts: ${sourceTable} vs ${targetTable}`);

    const sourceCount = await this._getConnector(sourceConnector).getRowCount(sourceTable, where);
    const targetCount = await this._getConnector(targetConnector).getRowCount(targetTable, where);

    const match = sourceCount === targetCount;
    const result = {
      sourceTable,
      targetTable,
      sourceCount,
      targetCount,
      match,
      difference: Math.abs(sourceCount - targetCount),
    };

    log.info(`Row count comparison: ${match ? 'MATCH' : 'MISMATCH'}`, result);
    return result;
  }

  async compareData(sourceQuery, targetQuery, options = {}) {
    const {
      sourceConnector = 'snowflake',
      targetConnector = 'snowflake',
      keyColumns = [],
      compareColumns = [],
      tolerance = 0,
      ignoreCase = false,
    } = options;

    log.info('Comparing data sets');
    const sourceData = await this._getConnector(sourceConnector).execute(sourceQuery);
    const targetData = await this._getConnector(targetConnector).execute(targetQuery);

    return this.compareDataSets(sourceData, targetData, { keyColumns, compareColumns, tolerance, ignoreCase });
  }

  compareDataSets(sourceData, targetData, options = {}) {
    const { keyColumns = [], compareColumns = [], tolerance = 0, ignoreCase = false } = options;

    const result = {
      sourceRowCount: sourceData.length,
      targetRowCount: targetData.length,
      matchingRows: 0,
      mismatchedRows: [],
      missingInTarget: [],
      missingInSource: [],
      columnMismatches: {},
    };

    const sourceMap = this._indexByKeys(sourceData, keyColumns);
    const targetMap = this._indexByKeys(targetData, keyColumns);

    for (const [key, sourceRow] of sourceMap) {
      const targetRow = targetMap.get(key);
      if (!targetRow) {
        result.missingInTarget.push(sourceRow);
        continue;
      }

      const cols = compareColumns.length > 0 ? compareColumns : Object.keys(sourceRow);
      const mismatches = [];

      for (const col of cols) {
        const sourceVal = sourceRow[col];
        const targetVal = targetRow[col];

        if (!this._valuesMatch(sourceVal, targetVal, tolerance, ignoreCase)) {
          mismatches.push({ column: col, source: sourceVal, target: targetVal });
          result.columnMismatches[col] = (result.columnMismatches[col] || 0) + 1;
        }
      }

      if (mismatches.length > 0) {
        result.mismatchedRows.push({ key, mismatches });
      } else {
        result.matchingRows++;
      }
    }

    for (const [key, targetRow] of targetMap) {
      if (!sourceMap.has(key)) {
        result.missingInSource.push(targetRow);
      }
    }

    result.passed =
      result.mismatchedRows.length === 0 &&
      result.missingInTarget.length === 0 &&
      result.missingInSource.length === 0;

    log.info(`Data comparison: ${result.passed ? 'PASSED' : 'FAILED'}`, {
      matching: result.matchingRows,
      mismatched: result.mismatchedRows.length,
      missingInTarget: result.missingInTarget.length,
      missingInSource: result.missingInSource.length,
    });

    return result;
  }

  async validateCalculation(query, connector, expectedCalc) {
    log.info('Validating calculation');
    const data = await this._getConnector(connector).execute(query);

    const results = [];
    for (const row of data) {
      const actual = row[expectedCalc.resultColumn];
      const inputs = expectedCalc.inputColumns.map((col) => parseFloat(row[col]) || 0);
      const expected = expectedCalc.formula(inputs);
      const tolerance = expectedCalc.tolerance || 0.01;
      const match = Math.abs(actual - expected) <= tolerance;

      results.push({
        inputs: Object.fromEntries(expectedCalc.inputColumns.map((col, i) => [col, inputs[i]])),
        expected,
        actual,
        match,
        difference: actual - expected,
      });
    }

    const allPassed = results.every((r) => r.match);
    log.info(`Calculation validation: ${allPassed ? 'PASSED' : 'FAILED'} (${results.filter((r) => r.match).length}/${results.length})`);
    return { passed: allPassed, results };
  }

  async validateAggregation(detailQuery, summaryQuery, connector, aggConfig) {
    const detailData = await this._getConnector(connector).execute(detailQuery);
    const summaryData = await this._getConnector(connector).execute(summaryQuery);

    const computedAgg = {};
    for (const row of detailData) {
      const groupKey = aggConfig.groupByColumns.map((c) => row[c]).join('|');
      if (!computedAgg[groupKey]) computedAgg[groupKey] = {};

      for (const { column, operation } of aggConfig.aggregations) {
        const val = parseFloat(row[column]) || 0;
        if (!computedAgg[groupKey][column]) computedAgg[groupKey][column] = { values: [], result: 0 };
        computedAgg[groupKey][column].values.push(val);
      }
    }

    for (const key of Object.keys(computedAgg)) {
      for (const { column, operation } of aggConfig.aggregations) {
        const values = computedAgg[key][column].values;
        switch (operation) {
          case 'sum': computedAgg[key][column].result = values.reduce((a, b) => a + b, 0); break;
          case 'avg': computedAgg[key][column].result = values.reduce((a, b) => a + b, 0) / values.length; break;
          case 'count': computedAgg[key][column].result = values.length; break;
          case 'min': computedAgg[key][column].result = Math.min(...values); break;
          case 'max': computedAgg[key][column].result = Math.max(...values); break;
        }
      }
    }

    const mismatches = [];
    const tolerance = aggConfig.tolerance || 0.01;

    for (const summaryRow of summaryData) {
      const groupKey = aggConfig.groupByColumns.map((c) => summaryRow[c]).join('|');
      const computed = computedAgg[groupKey];
      if (!computed) {
        mismatches.push({ groupKey, error: 'Not found in detail data' });
        continue;
      }

      for (const { column, operation } of aggConfig.aggregations) {
        const expected = computed[column].result;
        const actual = parseFloat(summaryRow[`${operation}_${column}`] || summaryRow[column]) || 0;
        if (Math.abs(expected - actual) > tolerance) {
          mismatches.push({ groupKey, column, operation, expected, actual, diff: actual - expected });
        }
      }
    }

    const passed = mismatches.length === 0;
    log.info(`Aggregation validation: ${passed ? 'PASSED' : 'FAILED'}`, { mismatches: mismatches.length });
    return { passed, mismatches, groupCount: Object.keys(computedAgg).length };
  }

  async generateComparisonReport(results, outputPath) {
    const reportPath = outputPath || path.join(config.paths.reports, `data-comparison-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    log.info(`Comparison report saved to ${reportPath}`);
    return reportPath;
  }

  _getConnector(name) {
    if (name === 'snowflake') return this.snowflake;
    if (name === 'databricks') return this.databricks;
    throw new Error(`Unknown connector: ${name}`);
  }

  _indexByKeys(data, keyColumns) {
    const map = new Map();
    for (const row of data) {
      const key = keyColumns.length > 0 ? keyColumns.map((k) => row[k]).join('|') : JSON.stringify(row);
      map.set(key, row);
    }
    return map;
  }

  _valuesMatch(a, b, tolerance = 0, ignoreCase = false) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return Math.abs(numA - numB) <= tolerance;
    }

    const strA = String(a);
    const strB = String(b);
    return ignoreCase ? strA.toLowerCase() === strB.toLowerCase() : strA === strB;
  }
}

export default DataComparisonAgent;
