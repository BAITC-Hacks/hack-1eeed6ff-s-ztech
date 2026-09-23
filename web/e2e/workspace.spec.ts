import { test, expect } from '@playwright/test';
import { A, B, C, fixture, mockApi, nodeDetail } from './fixture';

test.beforeEach(async ({ page }) => { await mockApi(page); });
for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
  test(`layout and keyboard ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size); await page.goto('/');
    await expect(page.getByText(/Тестовый контракт ·/)).toBeVisible();
    const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
    await search.fill(B); await search.press('Enter');
    await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
    await expect(page.getByRole('heading', { name: B, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/b1-${size.width}.png`, fullPage: true });
    await page.keyboard.press('Escape'); await expect(search).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Найти', exact: true })).toBeFocused();
  });
}
test('selection and clipboard preserve both neighbouring long gids', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.goto('/');
  await page.getByRole('button').filter({ has: page.getByText(A, { exact: true }) }).click();
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  await page.getByRole('button', { name: 'Скопировать полный gid' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(A);
  await page.getByRole('button').filter({ has: page.getByText(B, { exact: true }) }).click();
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  await page.getByRole('button', { name: 'Скопировать полный gid' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(B);
  await expect(page.locator('.queue-item.selected')).toContainText(B);
});
test('empty filters, exact search beyond filters, unknown gid and isolated seed', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Роль', { exact: true }).selectOption('transit');
  await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(C); await search.press('Enter');
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', C);
  await expect(page.getByText(/Фильтры сброшены/)).toBeVisible();
  await expect(page.getByText(/Изолированный узел/)).toBeVisible();
  await search.fill('999'); await search.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Такого gid нет'); await expect(search).toHaveValue('999');
  await expect(page.getByTestId('node-detail')).toHaveCount(0);
});
test('API error has a working retry and no synthetic success', async ({ page }) => {
  let failed = true;
  await page.route('**/api/v1/nodes?**', route => route.fulfill(failed ? { status: 503, json: { ...fixture.error, error: { code: 'NOT_READY', message: 'Snapshot ещё не готов' } } } : { json: fixture.nodes }));
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('Snapshot ещё не готов');
  await expect(page.getByText(A, { exact: true })).toHaveCount(0);
  failed = false; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText(A, { exact: true })).toBeVisible();
});
test('late A cannot replace B', async ({ page }) => {
  let releaseA!: () => void; const delayed = new Promise<void>(resolve => { releaseA = resolve; });
  await page.route(`**/api/v1/nodes/${A}`, async route => { await delayed; await route.fulfill({ json: nodeDetail(A) }).catch(() => {}); });
  await page.goto('/'); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(A); await search.press('Enter'); await expect(page.getByText(`Загрузка узла ${A}…`)).toBeVisible();
  await search.fill(B); await search.press('Enter'); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  releaseA(); await expect(page.getByRole('heading', { name: B, exact: true })).toBeVisible();
});
