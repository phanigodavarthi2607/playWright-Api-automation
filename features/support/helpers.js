/**
 * Resolve a dotted path like `data.users[0].id` against a JSON object.
 * Returns undefined if any segment is missing.
 */
function getPath(obj, path) {
  if (!path || path === '.') return obj;
  let cur = obj;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    const m = seg.match(/^([^[]+)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    cur = cur[m[1]];
    const idxRe = /\[(\d+)\]/g;
    let im;
    while ((im = idxRe.exec(m[2])) !== null) {
      if (cur == null) return undefined;
      cur = cur[Number(im[1])];
    }
  }
  return cur;
}

/**
 * Parse a DataTable into a flat object. Accepts either a vertical
 * `| key | value |` shape (rowsHash) or a 2-column matrix.
 */
function tableToObject(table) {
  const raw = table.raw();
  if (raw.length === 0) return {};
  if (raw.every((row) => row.length === 2)) {
    return Object.fromEntries(raw);
  }
  return table.rowsHash();
}

/**
 * Try to JSON-parse a string; return the original string on failure.
 */
function maybeJson(s) {
  if (typeof s !== 'string') return s;
  const trimmed = s.trim();
  if (!trimmed) return s;
  if (trimmed[0] !== '{' && trimmed[0] !== '[' && !/^["\d-]|true|false|null/.test(trimmed)) {
    return s;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return s;
  }
}

module.exports = { getPath, tableToObject, maybeJson };
