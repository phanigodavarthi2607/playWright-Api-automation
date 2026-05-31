const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../../config/env');
const { deepDiff, formatDiffs } = require('./compare');
const { logger } = require('./logger');

/**
 * Compare an actual API response against a stored baseline JSON file.
 *
 * opts:
 *   name            (required) logical baseline name, no extension
 *   shared          if true, baseline is shared across envs (folder = `shared`)
 *   baseDir         override baselines root (defaults to <repo>/baselines)
 *   ignorePaths     dot-paths to ignore, e.g. ['meta.timestamp', 'data[].id']
 *   unorderedArrays compare arrays as multisets
 *
 * Behaviour:
 *   - If the baseline file does not exist OR UPDATE_BASELINES=true,
 *     the current `actual` is written to disk and the check passes.
 *   - Otherwise the file is loaded and compared with deepDiff.
 *
 * Throws Error on mismatch with a readable diff.
 */
function assertMatchesBaseline(actual, opts) {
  if (!opts || !opts.name) throw new Error('assertMatchesBaseline: opts.name is required');

  const env = loadEnv();
  const baseDir = opts.baseDir || path.resolve(__dirname, '..', '..', 'baselines');
  const subdir = opts.shared ? 'shared' : env.name;
  const filePath = path.join(baseDir, subdir, `${opts.name}.json`);

  if (env.updateBaselines || !fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(actual, null, 2) + '\n', 'utf8');
    logger.warn(
      `Baseline ${env.updateBaselines ? 'UPDATED' : 'CREATED'}: ${path.relative(process.cwd(), filePath)}`,
    );
    return;
  }

  const expected = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const diffs = deepDiff(expected, actual, {
    ignorePaths: opts.ignorePaths,
    unorderedArrays: opts.unorderedArrays,
  });

  if (diffs.length > 0) {
    const rel = path.relative(process.cwd(), filePath);
    throw new Error(
      `Baseline mismatch for "${opts.name}" (${rel}):\n${formatDiffs(diffs)}\n\n` +
        `Re-run with UPDATE_BASELINES=true to refresh.`,
    );
  }
}

module.exports = { assertMatchesBaseline };
