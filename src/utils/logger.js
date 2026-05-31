const RANK = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel() {
  const lvl = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return RANK[lvl] != null ? RANK[lvl] : RANK.info;
}

function emit(level, ...args) {
  if (RANK[level] < currentLevel()) return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
}

const logger = {
  debug: (...a) => emit('debug', ...a),
  info: (...a) => emit('info', ...a),
  warn: (...a) => emit('warn', ...a),
  error: (...a) => emit('error', ...a),
};

module.exports = { logger };
