import fs from 'fs/promises';
import path from 'path';
import config from '../../core/config.js';
import { createAgentLogger } from '../../core/logger.js';

const log = createAgentLogger('UIAgent');

export class UIAgent {
  constructor() {
    this.locatorStrategies = ['id', 'data-testid', 'aria-label', 'role', 'text', 'css', 'xpath'];
  }

  async discoverPageElements(page, url) {
    log.info(`Discovering page elements at ${url}`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const elements = await page.evaluate(() => {
      const result = [];
      const interactable = document.querySelectorAll(
        'button, input, select, textarea, a, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [data-testid]'
      );

      interactable.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        result.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          id: el.id || null,
          name: el.name || null,
          testId: el.getAttribute('data-testid') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          role: el.getAttribute('role') || null,
          text: el.textContent?.trim().substring(0, 100) || null,
          placeholder: el.placeholder || null,
          className: el.className?.toString().substring(0, 200) || null,
          href: el.href || null,
          visible: rect.width > 0 && rect.height > 0,
          position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      });

      return result;
    });

    log.info(`Discovered ${elements.length} interactable elements`);
    return elements;
  }

  generateLocator(element) {
    if (element.testId) return { strategy: 'data-testid', selector: `[data-testid="${element.testId}"]`, confidence: 0.95 };
    if (element.id) return { strategy: 'id', selector: `#${element.id}`, confidence: 0.9 };
    if (element.ariaLabel) return { strategy: 'aria-label', selector: `[aria-label="${element.ariaLabel}"]`, confidence: 0.85 };
    if (element.role && element.text) return { strategy: 'role+text', selector: `${element.role}:has-text("${element.text.substring(0, 50)}")`, confidence: 0.8 };
    if (element.name) return { strategy: 'name', selector: `[name="${element.name}"]`, confidence: 0.75 };
    if (element.placeholder) return { strategy: 'placeholder', selector: `[placeholder="${element.placeholder}"]`, confidence: 0.7 };
    if (element.text && element.text.length < 50) return { strategy: 'text', selector: `text="${element.text}"`, confidence: 0.6 };

    const parts = [];
    parts.push(element.tag);
    if (element.type) parts.push(`[type="${element.type}"]`);
    return { strategy: 'css', selector: parts.join(''), confidence: 0.4 };
  }

  async generatePageObject(page, url, pageName) {
    const elements = await this.discoverPageElements(page, url);
    const locators = [];
    const methods = [];

    for (const el of elements) {
      const loc = this.generateLocator(el);
      const name = this._generateLocatorName(el);

      locators.push({ name, selector: loc.selector, confidence: loc.confidence, element: el.tag });

      if (el.tag === 'button' || el.role === 'button') {
        methods.push({
          name: `click${this._toPascalCase(name)}`,
          params: '',
          body: `await this.click(this.locators.${name});`,
        });
      } else if (el.tag === 'input' && el.type !== 'checkbox' && el.type !== 'radio') {
        methods.push({
          name: `fill${this._toPascalCase(name)}`,
          params: 'value',
          body: `await this.fill(this.locators.${name}, value);`,
        });
      } else if (el.tag === 'select') {
        methods.push({
          name: `select${this._toPascalCase(name)}`,
          params: 'value',
          body: `await this.selectOption(this.locators.${name}, value);`,
        });
      }
    }

    const className = this._toPascalCase(pageName) + 'Page';
    const urlPath = new URL(url).pathname;

    return { className, url: urlPath, locators, methods };
  }

  async captureVisualBaseline(page, name) {
    const screenshotPath = path.join(config.paths.reports, 'visual-baselines', `${name}.png`);
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log.info(`Visual baseline captured: ${screenshotPath}`);
    return screenshotPath;
  }

  async compareVisual(page, baselineName) {
    const baselinePath = path.join(config.paths.reports, 'visual-baselines', `${baselineName}.png`);
    const currentPath = path.join(config.paths.reports, 'visual-current', `${baselineName}.png`);
    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    await page.screenshot({ path: currentPath, fullPage: true });

    try {
      const baseline = await fs.readFile(baselinePath);
      const current = await fs.readFile(currentPath);
      const match = baseline.equals(current);
      return { match, baselinePath, currentPath };
    } catch {
      log.warn(`No baseline found for ${baselineName}, creating new baseline`);
      await this.captureVisualBaseline(page, baselineName);
      return { match: true, baselinePath, currentPath, newBaseline: true };
    }
  }

  async validatePageAccessibility(page) {
    const issues = await page.evaluate(() => {
      const problems = [];
      document.querySelectorAll('img').forEach((img) => {
        if (!img.alt) problems.push({ type: 'missing-alt', element: img.src });
      });
      document.querySelectorAll('input, select, textarea').forEach((el) => {
        const label = el.labels?.[0] || document.querySelector(`label[for="${el.id}"]`);
        if (!label && !el.getAttribute('aria-label')) {
          problems.push({ type: 'missing-label', element: el.name || el.id || el.type });
        }
      });
      const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
      for (let i = 1; i < headings.length; i++) {
        const prev = parseInt(headings[i - 1].tagName[1]);
        const curr = parseInt(headings[i].tagName[1]);
        if (curr > prev + 1) problems.push({ type: 'heading-skip', from: `h${prev}`, to: `h${curr}` });
      }
      return problems;
    });

    log.info(`Accessibility check: ${issues.length} issues found`);
    return issues;
  }

  _generateLocatorName(element) {
    if (element.testId) return this._toCamelCase(element.testId);
    if (element.id) return this._toCamelCase(element.id);
    if (element.name) return this._toCamelCase(element.name);
    if (element.ariaLabel) return this._toCamelCase(element.ariaLabel.substring(0, 30));
    if (element.text) return this._toCamelCase(element.text.substring(0, 30));
    return `${element.tag}Element${Math.random().toString(36).substring(2, 6)}`;
  }

  _toCamelCase(str) {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^[A-Z]/, (c) => c.toLowerCase())
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  _toPascalCase(str) {
    const camel = this._toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }
}

export default UIAgent;
