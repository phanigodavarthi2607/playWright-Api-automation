/**
 * Deep-diff two JSON-compatible values.
 * Returns a flat array of { path, expected, actual, kind } entries.
 * Empty array => equal.
 *
 * Options:
 *   ignorePaths: string[]  e.g. ['meta.timestamp', 'data[].id']
 *   unorderedArrays: bool  compare arrays as multisets
 */
function deepDiff(expected, actual, options = {}) {
  const ignore = new Set(options.ignorePaths || []);
  const diffs = [];
  walk(expected, actual, '', diffs, ignore, !!options.unorderedArrays);
  return diffs;
}

function walk(expected, actual, p, diffs, ignore, unordered) {
  if (ignore.has(p) || ignore.has(normalizeArrayPath(p))) return;
  if (expected === actual) return;

  if (expected === null || actual === null || expected === undefined || actual === undefined) {
    if (expected === undefined) {
      diffs.push({ path: p, expected, actual, kind: 'extra' });
    } else if (actual === undefined) {
      diffs.push({ path: p, expected, actual, kind: 'missing' });
    } else {
      diffs.push({ path: p, expected, actual, kind: 'value-mismatch' });
    }
    return;
  }

  const te = typeOf(expected);
  const ta = typeOf(actual);
  if (te !== ta) {
    diffs.push({ path: p, expected, actual, kind: 'type-mismatch' });
    return;
  }

  if (te === 'array') {
    if (unordered) {
      const es = expected.map((x) => JSON.stringify(x)).sort();
      const as_ = actual.map((x) => JSON.stringify(x)).sort();
      if (JSON.stringify(es) !== JSON.stringify(as_)) {
        diffs.push({ path: p, expected, actual, kind: 'value-mismatch' });
      }
      return;
    }
    const max = Math.max(expected.length, actual.length);
    for (let i = 0; i < max; i++) {
      walk(expected[i], actual[i], `${p}[${i}]`, diffs, ignore, unordered);
    }
    return;
  }

  if (te === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) {
      const child = p ? `${p}.${k}` : k;
      walk(expected[k], actual[k], child, diffs, ignore, unordered);
    }
    return;
  }

  if (expected !== actual) {
    diffs.push({ path: p, expected, actual, kind: 'value-mismatch' });
  }
}

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function normalizeArrayPath(p) {
  return p.replace(/\[\d+\]/g, '[]');
}

function formatDiffs(diffs) {
  if (diffs.length === 0) return 'No differences.';
  return diffs
    .map(
      (d) =>
        `  - [${d.kind}] ${d.path || '<root>'}\n` +
        `      expected: ${stringify(d.expected)}\n` +
        `      actual:   ${stringify(d.actual)}`,
    )
    .join('\n');
}

function stringify(v) {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 200 ? `${s.slice(0, 200)}…` : String(s);
  } catch {
    return String(v);
  }
}

module.exports = { deepDiff, formatDiffs };
