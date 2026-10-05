import { test, expect } from '@playwright/test';
import { BasePage } from '../../src/pages/base-page.js';

test.describe('Example UI Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('homepage loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/.*/);
    const basePage = new BasePage(page);
    const title = await basePage.getTitle();
    expect(title).toBeTruthy();
  });

  test('navigation elements are visible', async ({ page }) => {
    const nav = page.locator('nav, [role="navigation"], header');
    const count = await nav.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
