import { expect, type Page } from '@playwright/test';
export async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.locator('.welcome, .app')).toBeVisible();
  const enter = page.getByRole('button', { name: 'Открыть платформу', exact: true });
  if (await enter.isVisible()) await enter.click();
  await expect(page.locator('.app')).toBeVisible();
}
