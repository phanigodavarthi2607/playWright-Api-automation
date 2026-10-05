import { chromium, firefox, webkit } from '@playwright/test';
import { createAgentLogger } from './logger.js';

const log = createAgentLogger('BrowserManager');

const BROWSER_TYPES = { chromium, firefox, webkit };

export class BrowserManager {
  constructor() {
    this.browsers = new Map();
    this.contexts = new Map();
  }

  async launch(browserType = 'chromium', options = {}) {
    const key = `${browserType}-${Date.now()}`;
    const launcher = BROWSER_TYPES[browserType];
    if (!launcher) throw new Error(`Unknown browser type: ${browserType}`);

    log.info(`Launching ${browserType} browser`, { options });
    const browser = await launcher.launch({
      headless: true,
      ...options,
    });
    this.browsers.set(key, browser);
    return { key, browser };
  }

  async createContext(browserKey, contextOptions = {}) {
    const browser = this.browsers.get(browserKey);
    if (!browser) throw new Error(`Browser not found: ${browserKey}`);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ...contextOptions,
    });
    const contextKey = `ctx-${Date.now()}`;
    this.contexts.set(contextKey, context);
    return { key: contextKey, context };
  }

  async closeAll() {
    for (const [key, context] of this.contexts) {
      await context.close().catch(() => {});
      this.contexts.delete(key);
    }
    for (const [key, browser] of this.browsers) {
      await browser.close().catch(() => {});
      this.browsers.delete(key);
    }
    log.info('All browsers closed');
  }
}

export default new BrowserManager();
