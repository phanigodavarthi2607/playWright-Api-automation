const { request } = require('@playwright/test');
const { loadEnv } = require('../../config/env');
const { logger } = require('../utils/logger');

/**
 * Handles SiteMinder (SM_SESSION) authentication.
 *
 * Strategy:
 *   1. If env.auth.smSession is already provided, use it as-is (no login call).
 *   2. Otherwise POST {username, password} to AUTH_BASE_URL + AUTH_LOGIN_PATH
 *      and extract SMSESSION from Set-Cookie or the JSON response body.
 *
 * The token is cached for the whole test run.
 */
class AuthService {
  static reset() {
    AuthService._cached = undefined;
  }

  /**
   * @returns {Promise<{smSession: string, fetchedAt: number, source: 'env'|'login'}>}
   */
  static async getToken(env = loadEnv()) {
    if (AuthService._cached) return AuthService._cached;

    if (env.auth.smSession) {
      logger.info('Using SM_SESSION from environment (skipping login call).');
      AuthService._cached = {
        smSession: env.auth.smSession,
        fetchedAt: Date.now(),
        source: 'env',
      };
      return AuthService._cached;
    }

    if (!env.auth.username || !env.auth.password) {
      throw new Error(
        'No SM_SESSION provided and AUTH_USERNAME / AUTH_PASSWORD are empty. ' +
          'Cannot perform SiteMinder login.',
      );
    }

    logger.info(`Logging in to ${env.authBaseUrl}${env.auth.loginPath} ...`);

    const ctx = await request.newContext({
      baseURL: env.authBaseUrl,
      timeout: env.requestTimeoutMs,
    });

    try {
      const resp = await ctx.post(env.auth.loginPath, {
        data: {
          username: env.auth.username,
          password: env.auth.password,
        },
      });

      if (!resp.ok()) {
        const body = await resp.text();
        throw new Error(
          `Login failed (${resp.status()} ${resp.statusText()}): ${body}`,
        );
      }

      const smSession = extractSmSession(resp.headers(), await safeJson(resp));
      if (!smSession) {
        throw new Error(
          'Login succeeded but no SMSESSION token found in Set-Cookie header or response body.',
        );
      }

      AuthService._cached = {
        smSession,
        fetchedAt: Date.now(),
        source: 'login',
      };
      logger.info('SM_SESSION acquired successfully.');
      return AuthService._cached;
    } finally {
      await ctx.dispose();
    }
  }
}

AuthService._cached = undefined;

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return undefined;
  }
}

function extractSmSession(headers, body) {
  const setCookie = headers['set-cookie'];
  if (setCookie) {
    const cookies = Array.isArray(setCookie)
      ? setCookie
      : setCookie.split(/,(?=\s*[^;]+?=)/);
    for (const c of cookies) {
      const m = c.match(/SMSESSION=([^;]+)/i);
      if (m) return m[1];
    }
  }
  if (body) {
    for (const k of ['SMSESSION', 'smSession', 'sm_session', 'token']) {
      const v = body[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return undefined;
}

module.exports = { AuthService };
