import { chromium } from '@playwright/test';
import { AutoHealingAgent } from './index.js';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';

const log = createAgentLogger('LocatorSnapshot');

async function takeSnapshots() {
  const pages = process.argv.slice(2);
  if (pages.length === 0) {
    log.info('Usage: node snapshot.js <url1> [url2] ...');
    log.info('Takes locator snapshots for auto-healing reference');
    process.exit(0);
  }

  const healer = new AutoHealingAgent();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    for (const url of pages) {
      const pageName = new URL(url).pathname.replace(/\//g, '_').replace(/^_/, '') || 'home';
      log.info(`Snapshotting: ${url} as "${pageName}"`);
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await healer.takeSnapshot(page, pageName);
    }
    log.info('All snapshots complete');
  } finally {
    await browser.close();
  }
}

takeSnapshots().catch((err) => {
  log.error('Snapshot failed', { error: err.message });
  process.exit(1);
});
