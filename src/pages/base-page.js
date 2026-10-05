export class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.locators = {};
  }

  async navigate(path = '') {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForReady() {
    await this.page.waitForLoadState('networkidle');
  }

  async getTitle() {
    return this.page.title();
  }

  async screenshot(name) {
    return this.page.screenshot({ path: `reports/screenshots/${name}.png`, fullPage: true });
  }

  async getText(selector) {
    return this.page.locator(selector).textContent();
  }

  async click(selector) {
    await this.page.locator(selector).click();
  }

  async fill(selector, value) {
    await this.page.locator(selector).fill(value);
  }

  async isVisible(selector) {
    return this.page.locator(selector).isVisible();
  }

  async waitFor(selector, options = {}) {
    await this.page.locator(selector).waitFor({ state: 'visible', timeout: 10_000, ...options });
  }

  async selectOption(selector, value) {
    await this.page.locator(selector).selectOption(value);
  }

  async getTableData(tableSelector) {
    const rows = await this.page.locator(`${tableSelector} tr`).all();
    const data = [];
    for (const row of rows) {
      const cells = await row.locator('td, th').allTextContents();
      data.push(cells);
    }
    return data;
  }

  getLocatorMap() {
    return { ...this.locators };
  }

  setLocator(name, selector) {
    this.locators[name] = selector;
  }
}

export default BasePage;
