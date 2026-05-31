const { deepDiff, formatDiffs } = require('../utils/compare');

/**
 * Normalize a DB row so its keys/casing line up with the API JSON.
 *   - lowercases keys (warehouses commonly return UPPER_CASE)
 *   - applies an optional column->field rename map
 *   - drops ignored keys
 *   - converts Date instances to ISO strings
 */
function normalizeRow(row, opts = {}) {
  const ignore = new Set(opts.ignoreKeys || []);
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const lower = k.toLowerCase();
    const mapped =
      (opts.columnMap && (opts.columnMap[k] || opts.columnMap[lower])) || lower;
    if (ignore.has(k) || ignore.has(lower) || ignore.has(mapped)) continue;
    out[mapped] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/**
 * Assert that the API response array of records matches the rows returned
 * by a Databricks/Snowflake query.
 *
 * opts:
 *   ignoreKeys  string[]  columns/JSON keys to ignore
 *   columnMap   { dbCol: apiField }  rename map (case-insensitive)
 *   unordered   boolean   compare as multisets (default true)
 *
 * Throws Error with a readable diff on mismatch.
 */
function assertApiMatchesDb(apiRows, dbRows, opts = {}) {
  const normDb = (dbRows || []).map((r) => normalizeRow(r, opts));
  const normApi = (apiRows || []).map((r) => normalizeRow(r, opts));

  const diffs = deepDiff(normDb, normApi, {
    ignorePaths: (opts.ignoreKeys || []).map((k) => `[].${k.toLowerCase()}`),
    unorderedArrays: opts.unordered != null ? opts.unordered : true,
  });

  if (diffs.length > 0) {
    throw new Error(`API response does not match DB rows:\n${formatDiffs(diffs)}`);
  }
}

module.exports = { normalizeRow, assertApiMatchesDb };
