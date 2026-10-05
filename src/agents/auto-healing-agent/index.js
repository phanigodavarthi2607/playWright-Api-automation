import fs from 'fs/promises';
import path from 'path';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';

const log = createAgentLogger('AutoHealingAgent');

export class AutoHealingAgent {
  constructor() {
    this.snapshotDir = config.paths.locatorSnapshots;
    this.maxAttempts = config.agent.maxHealAttempts;
    this.similarityThreshold = config.agent.locatorSimilarityThreshold;
  }

  async takeSnapshot(page, pageName) {
    log.info(`Taking locator snapshot for page: ${pageName}`);

    const snapshot = await page.evaluate(() => {
      const elements = [];
      const allElements = document.querySelectorAll('*');

      allElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD'].includes(el.tagName)) return;

        const isInteractable = el.matches(
          'button, input, select, textarea, a, [role], [data-testid], [onclick], [href]'
        );
        if (!isInteractable && !el.id && !el.getAttribute('data-testid')) return;

        elements.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          testId: el.getAttribute('data-testid') || null,
          name: el.name || null,
          type: el.type || null,
          className: el.className?.toString() || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          ariaRole: el.getAttribute('role') || null,
          text: el.textContent?.trim().substring(0, 200) || null,
          placeholder: el.placeholder || null,
          href: el.href || null,
          position: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          parentTag: el.parentElement?.tagName.toLowerCase() || null,
          parentId: el.parentElement?.id || null,
          siblingIndex: Array.from(el.parentElement?.children || []).indexOf(el),
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            if (!['style', 'class'].includes(attr.name)) acc[attr.name] = attr.value;
            return acc;
          }, {}),
        });
      });

      return elements;
    });

    const snapshotData = {
      pageName,
      url: page.url(),
      timestamp: new Date().toISOString(),
      elementCount: snapshot.length,
      elements: snapshot,
    };

    await fs.mkdir(this.snapshotDir, { recursive: true });
    const filePath = path.join(this.snapshotDir, `${pageName}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshotData, null, 2));
    log.info(`Snapshot saved: ${filePath} (${snapshot.length} elements)`);

    return snapshotData;
  }

  async healLocator(page, brokenSelector, pageName) {
    log.info(`Attempting to heal locator: ${brokenSelector}`);

    const snapshotPath = path.join(this.snapshotDir, `${pageName}.json`);
    let previousSnapshot = null;

    try {
      const data = await fs.readFile(snapshotPath, 'utf-8');
      previousSnapshot = JSON.parse(data);
    } catch {
      log.warn('No previous snapshot found, will attempt heuristic healing');
    }

    const brokenInfo = this._parseSelector(brokenSelector);
    const candidates = [];

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const strategy = this._getHealingStrategy(attempt);
      log.info(`Healing attempt ${attempt + 1}/${this.maxAttempts}: ${strategy.name}`);

      const newSelector = await this._tryHealingStrategy(page, brokenInfo, previousSnapshot, strategy);
      if (newSelector) {
        const valid = await this._validateSelector(page, newSelector);
        if (valid) {
          const confidence = await this._calculateConfidence(page, newSelector, brokenInfo, previousSnapshot);
          candidates.push({ selector: newSelector, confidence, strategy: strategy.name });
        }
      }
    }

    if (candidates.length === 0) {
      log.error(`Could not heal locator: ${brokenSelector}`);
      return null;
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];

    if (best.confidence < this.similarityThreshold) {
      log.warn(`Best candidate below threshold (${best.confidence} < ${this.similarityThreshold})`);
      return { ...best, belowThreshold: true, allCandidates: candidates };
    }

    log.info(`Healed locator: "${brokenSelector}" -> "${best.selector}" (confidence: ${best.confidence})`);
    return { ...best, allCandidates: candidates };
  }

  async healTestFile(testFilePath, failures) {
    log.info(`Healing test file: ${testFilePath}`);
    let content = await fs.readFile(testFilePath, 'utf-8');
    const healed = [];

    for (const failure of failures) {
      if (failure.category !== 'locator') continue;

      const brokenSelector = this._extractSelectorFromError(failure.error);
      if (!brokenSelector) continue;

      const pageName = this._inferPageName(testFilePath);
      const fix = failure.healResult;

      if (fix && fix.confidence >= this.similarityThreshold) {
        const escaped = brokenSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), fix.selector);
        healed.push({ original: brokenSelector, fixed: fix.selector, confidence: fix.confidence });
      }
    }

    if (healed.length > 0) {
      await fs.writeFile(testFilePath, content);
      log.info(`Healed ${healed.length} locators in ${testFilePath}`);
    }

    return healed;
  }

  _parseSelector(selector) {
    const info = { original: selector, type: 'unknown', key: null, value: null };

    if (selector.startsWith('#')) {
      info.type = 'id';
      info.key = 'id';
      info.value = selector.slice(1);
    } else if (selector.startsWith('[data-testid=')) {
      info.type = 'data-testid';
      info.key = 'data-testid';
      info.value = selector.match(/\[data-testid="?([^"\]]+)"?\]/)?.[1];
    } else if (selector.startsWith('[aria-label=')) {
      info.type = 'aria-label';
      info.key = 'aria-label';
      info.value = selector.match(/\[aria-label="?([^"\]]+)"?\]/)?.[1];
    } else if (selector.startsWith('text=') || selector.startsWith('"')) {
      info.type = 'text';
      info.value = selector.replace(/^text="|"$/g, '');
    } else {
      info.type = 'css';
      info.value = selector;
    }

    return info;
  }

  _getHealingStrategy(attempt) {
    const strategies = [
      { name: 'attribute-match', description: 'Match by similar attributes (id, testid, aria-label)' },
      { name: 'text-similarity', description: 'Match by text content similarity' },
      { name: 'structural-position', description: 'Match by DOM position and parent structure' },
    ];
    return strategies[attempt] || strategies[strategies.length - 1];
  }

  async _tryHealingStrategy(page, brokenInfo, snapshot, strategy) {
    switch (strategy.name) {
      case 'attribute-match':
        return this._healByAttribute(page, brokenInfo, snapshot);
      case 'text-similarity':
        return this._healByText(page, brokenInfo, snapshot);
      case 'structural-position':
        return this._healByStructure(page, brokenInfo, snapshot);
      default:
        return null;
    }
  }

  async _healByAttribute(page, brokenInfo, snapshot) {
    if (!brokenInfo.value) return null;

    const candidates = await page.evaluate((searchValue) => {
      const found = [];
      const allElements = document.querySelectorAll('*');

      allElements.forEach((el) => {
        for (const attr of el.attributes) {
          if (attr.value && attr.value.includes(searchValue)) {
            found.push({
              selector: el.id ? `#${el.id}` : el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : null,
              matchAttr: attr.name,
              matchValue: attr.value,
            });
          }
        }

        const id = el.id || '';
        const testId = el.getAttribute('data-testid') || '';
        if (id && (id.includes(searchValue) || this._fuzzyMatch(id, searchValue))) {
          found.push({ selector: `#${id}`, matchAttr: 'id', score: 0.9 });
        }
        if (testId && (testId.includes(searchValue) || this._fuzzyMatch(testId, searchValue))) {
          found.push({ selector: `[data-testid="${testId}"]`, matchAttr: 'data-testid', score: 0.85 });
        }
      });

      return found.filter((f) => f.selector);
    }, brokenInfo.value);

    return candidates?.[0]?.selector || null;
  }

  async _healByText(page, brokenInfo, snapshot) {
    if (!brokenInfo.value) return null;

    const match = snapshot?.elements.find((el) => {
      if (!el.text) return false;
      return el.text.toLowerCase().includes(brokenInfo.value.toLowerCase()) ||
        this._stringSimilarity(el.text.toLowerCase(), brokenInfo.value.toLowerCase()) > 0.6;
    });

    if (match) {
      if (match.testId) return `[data-testid="${match.testId}"]`;
      if (match.id) return `#${match.id}`;
      if (match.ariaLabel) return `[aria-label="${match.ariaLabel}"]`;
      if (match.text && match.text.length < 60) return `text="${match.text}"`;
    }

    return null;
  }

  async _healByStructure(page, brokenInfo, snapshot) {
    if (!snapshot) return null;

    const original = snapshot.elements.find((el) => {
      if (brokenInfo.type === 'id' && el.id === brokenInfo.value) return true;
      if (brokenInfo.type === 'data-testid' && el.testId === brokenInfo.value) return true;
      return false;
    });

    if (!original) return null;

    const newSelector = await page.evaluate((criteria) => {
      const candidates = document.querySelectorAll(criteria.tag);
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        const posMatch =
          Math.abs(rect.x - criteria.position.x) < 50 &&
          Math.abs(rect.y - criteria.position.y) < 50;

        const parentMatch = el.parentElement?.tagName.toLowerCase() === criteria.parentTag;

        if (posMatch && parentMatch) {
          if (el.id) return `#${el.id}`;
          if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
          if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
        }
      }
      return null;
    }, original);

    return newSelector;
  }

  async _validateSelector(page, selector) {
    try {
      const count = await page.locator(selector).count();
      return count > 0;
    } catch {
      return false;
    }
  }

  async _calculateConfidence(page, newSelector, brokenInfo, snapshot) {
    let confidence = 0.5;

    const newInfo = this._parseSelector(newSelector);
    if (newInfo.type === 'data-testid') confidence += 0.2;
    else if (newInfo.type === 'id') confidence += 0.15;
    else if (newInfo.type === 'aria-label') confidence += 0.1;

    if (brokenInfo.value && newInfo.value) {
      const similarity = this._stringSimilarity(brokenInfo.value, newInfo.value);
      confidence += similarity * 0.3;
    }

    return Math.min(confidence, 1.0);
  }

  _extractSelectorFromError(errorMessage) {
    const patterns = [
      /locator\('([^']+)'\)/,
      /selector "([^"]+)"/,
      /waiting for selector "([^"]+)"/,
      /\[data-testid="([^"]+)"\]/,
      /#([a-zA-Z][\w-]*)/,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  _inferPageName(testFilePath) {
    return path.basename(testFilePath, '.spec.js').replace(/-/g, '_');
  }

  _stringSimilarity(a, b) {
    if (a === b) return 1;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;

    const costs = [];
    for (let i = 0; i <= longer.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= shorter.length; j++) {
        if (i === 0) { costs[j] = j; continue; }
        if (j > 0) {
          let newValue = costs[j - 1];
          if (longer[i - 1] !== shorter[j - 1]) {
            newValue = Math.min(newValue, lastValue, costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[shorter.length] = lastValue;
    }

    return (longer.length - costs[shorter.length]) / longer.length;
  }
}

export default AutoHealingAgent;
