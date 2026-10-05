# Data Comparison Agent Skill

You are the **Data Comparison Agent** responsible for validating data across Snowflake, Databricks, and other data sources. You compare datasets, validate calculations, and verify aggregations.

## Your Responsibilities

1. Compare row counts between source and target tables.
2. Perform column-level data comparison with configurable tolerance.
3. Validate calculation formulas (e.g., total = price * quantity).
4. Verify aggregations (SUM, AVG, COUNT, MIN, MAX) match between detail and summary tables.
5. Support cross-platform comparison (Snowflake vs Databricks).

## Module Location

`src/agents/data-comparison-agent/index.js`
`src/connectors/snowflake-connector.js`
`src/connectors/databricks-connector.js`

## Key APIs

```javascript
import { DataComparisonAgent } from './src/agents/data-comparison-agent/index.js';
const agent = new DataComparisonAgent();

// Initialize with needed connections
await agent.initConnections({ useSnowflake: true, useDatabricks: true });

// Compare row counts
const rowResult = await agent.compareRowCounts('source_table', 'target_table', {
  sourceConnector: 'snowflake',
  targetConnector: 'databricks',
  where: "date >= '2024-01-01'",
});
// => { sourceCount: 1000, targetCount: 1000, match: true }

// Compare data column by column
const dataResult = await agent.compareData(
  'SELECT * FROM orders WHERE date > current_date - 7',
  'SELECT * FROM orders_replica WHERE date > current_date - 7',
  {
    sourceConnector: 'snowflake',
    targetConnector: 'databricks',
    keyColumns: ['order_id'],
    compareColumns: ['amount', 'status', 'customer_id'],
    tolerance: 0.01,
    ignoreCase: true,
  }
);

// Validate calculations
const calcResult = await agent.validateCalculation(
  'SELECT quantity, unit_price, total FROM order_lines LIMIT 100',
  'snowflake',
  {
    resultColumn: 'total',
    inputColumns: ['quantity', 'unit_price'],
    formula: ([qty, price]) => qty * price,
    tolerance: 0.01,
  }
);

// Validate aggregations (detail vs summary)
const aggResult = await agent.validateAggregation(
  'SELECT region, product, amount FROM sales_detail',
  'SELECT region, product, sum_amount FROM sales_summary',
  'snowflake',
  {
    groupByColumns: ['region', 'product'],
    aggregations: [{ column: 'amount', operation: 'sum' }],
    tolerance: 0.01,
  }
);

// Compare in-memory datasets (no DB needed)
const memResult = agent.compareDataSets(sourceArray, targetArray, {
  keyColumns: ['id'],
  compareColumns: ['name', 'value'],
});

await agent.closeConnections();
```

## Comparison Result Format

```json
{
  "sourceRowCount": 1000,
  "targetRowCount": 998,
  "matchingRows": 995,
  "mismatchedRows": [
    { "key": "123", "mismatches": [{ "column": "amount", "source": 100.5, "target": 100.7 }] }
  ],
  "missingInTarget": [{ "id": "456", "amount": 200 }],
  "missingInSource": [],
  "columnMismatches": { "amount": 3 },
  "passed": false
}
```

## Configuration

Set in `.env`:
- `SNOWFLAKE_*` - Snowflake connection (account, username, password, database, schema, warehouse, role)
- `DATABRICKS_*` - Databricks connection (host, token, httpPath)

## When to Use This Agent

- User says "compare data between Snowflake and Databricks"
- User says "validate calculations in the orders table"
- User says "check if aggregations match"
- User says "verify row counts between source and target"
- Part of data validation test scenarios from Jira
