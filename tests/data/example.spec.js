import { test, expect } from '@playwright/test';
import { DataComparisonAgent } from '../../src/agents/data-comparison-agent/index.js';

test.describe('Example Data Comparison Test Suite', () => {
  const agent = new DataComparisonAgent();

  test('in-memory data comparison works', () => {
    const source = [
      { id: 1, name: 'Alice', amount: 100.5 },
      { id: 2, name: 'Bob', amount: 200.0 },
      { id: 3, name: 'Charlie', amount: 300.75 },
    ];

    const target = [
      { id: 1, name: 'Alice', amount: 100.5 },
      { id: 2, name: 'Bob', amount: 200.0 },
      { id: 3, name: 'Charlie', amount: 300.75 },
    ];

    const result = agent.compareDataSets(source, target, {
      keyColumns: ['id'],
      compareColumns: ['name', 'amount'],
    });

    expect(result.passed).toBe(true);
    expect(result.matchingRows).toBe(3);
    expect(result.mismatchedRows).toHaveLength(0);
  });

  test('detects data mismatches', () => {
    const source = [
      { id: 1, name: 'Alice', amount: 100 },
      { id: 2, name: 'Bob', amount: 200 },
    ];

    const target = [
      { id: 1, name: 'Alice', amount: 105 },
      { id: 2, name: 'Bob', amount: 200 },
    ];

    const result = agent.compareDataSets(source, target, {
      keyColumns: ['id'],
      compareColumns: ['name', 'amount'],
      tolerance: 0,
    });

    expect(result.passed).toBe(false);
    expect(result.mismatchedRows).toHaveLength(1);
    expect(result.mismatchedRows[0].mismatches[0].column).toBe('amount');
  });

  test('tolerance-based comparison', () => {
    const source = [{ id: 1, value: 100.001 }];
    const target = [{ id: 1, value: 100.002 }];

    const result = agent.compareDataSets(source, target, {
      keyColumns: ['id'],
      compareColumns: ['value'],
      tolerance: 0.01,
    });

    expect(result.passed).toBe(true);
  });

  test('detects missing rows', () => {
    const source = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ];

    const target = [
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ];

    const result = agent.compareDataSets(source, target, {
      keyColumns: ['id'],
      compareColumns: ['name'],
    });

    expect(result.passed).toBe(false);
    expect(result.missingInTarget).toHaveLength(1);
    expect(result.missingInTarget[0].id).toBe(2);
  });
});
