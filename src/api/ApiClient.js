const { request } = require('@playwright/test');
const { loadEnv } = require('../../config/env');
const { AuthService } = require('./AuthService');
const { logger } = require('../utils/logger');

/**
 * Thin wrapper over Playwright's APIRequestContext that:
 *   - injects the SM_SESSION cookie on every call
 *   - applies env-driven baseURL & timeouts
 *   - logs request/response metadata
 *   - exposes verb helpers (get / post / put / patch / delete)
 */
class ApiClient {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  static async create(env = loadEnv()) {
    const { smSession } = await AuthService.getToken(env);

    const ctx = await request.newContext({
      baseURL: env.apiBaseUrl,
      timeout: env.requestTimeoutMs,
      extraHTTPHeaders: {
        Accept: 'application/json',
        Cookie: `SMSESSION=${smSession}`,
      },
    });

    return new ApiClient(ctx, env);
  }

  context() {
    return this.ctx;
  }

  async dispose() {
    await this.ctx.dispose();
  }

  get(p, opts = {}) {
    return this._call('GET', p, opts);
  }
  post(p, opts = {}) {
    return this._call('POST', p, opts);
  }
  put(p, opts = {}) {
    return this._call('PUT', p, opts);
  }
  patch(p, opts = {}) {
    return this._call('PATCH', p, opts);
  }
  delete(p, opts = {}) {
    return this._call('DELETE', p, opts);
  }

  async _call(method, p, opts) {
    const url = buildUrl(p, opts.query);
    logger.debug(`[${this.env.name}] ${method} ${url}`);

    const resp = await this.ctx.fetch(url, {
      method,
      data: opts.body,
      headers: opts.headers,
      timeout: opts.timeout != null ? opts.timeout : this.env.requestTimeoutMs,
    });

    logger.debug(`[${this.env.name}] ${method} ${url} -> ${resp.status()}`);
    return resp;
  }
}

function buildUrl(p, query) {
  if (!query) return p;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (!qs) return p;
  return p.includes('?') ? `${p}&${qs}` : `${p}?${qs}`;
}

module.exports = { ApiClient };
