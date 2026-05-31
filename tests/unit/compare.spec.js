const { test, expect } = require('@playwright/test');
const { deepDiff } = require('../../src/utils/compare');

test.describe('deepDiff @unit', () => {
  test('returns no diffs for identical objects', () => {
    const a = { id: 1, name: 'jane', tags: ['x', 'y'] };
    const b = { id: 1, name: 'jane', tags: ['x', 'y'] };
    expect(deepDiff(a, b)).toEqual([]);
  });

  test('detects value mismatches', () => {
    const diffs = deepDiff({ id: 1 }, { id: 2 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('value-mismatch');
    expect(diffs[0].path).toBe('id');
  });

  test('detects missing and extra keys', () => {
    const diffs = deepDiff({ a: 1, b: 2 }, { a: 1, c: 3 });
    const kinds = diffs.map((d) => `${d.path}:${d.kind}`).sort();
    expect(kinds).toEqual(['b:missing', 'c:extra']);
  });

  test('honors ignorePaths for nested fields', () => {
    const exp = { meta: { ts: 1 }, data: { x: 1 } };
    const act = { meta: { ts: 999 }, data: { x: 1 } };
    expect(deepDiff(exp, act, { ignorePaths: ['meta.ts'] })).toEqual([]);
  });

  test('honors ignorePaths using [] wildcard for arrays', () => {
    const exp = { data: [{ id: 1, n: 'a' }, { id: 2, n: 'b' }] };
    const act = { data: [{ id: 9, n: 'a' }, { id: 8, n: 'b' }] };
    expect(deepDiff(exp, act, { ignorePaths: ['data[].id'] })).toEqual([]);
  });

  test('unorderedArrays treats arrays as multisets', () => {
    const a = [1, 2, 3];
    const b = [3, 1, 2];
    expect(deepDiff(a, b)).not.toEqual([]);
    expect(deepDiff(a, b, { unorderedArrays: true })).toEqual([]);
  });
});
