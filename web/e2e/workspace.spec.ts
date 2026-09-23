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
    await page.screenshot({ path: `test-results/workspace-${size.width}.png`, fullPage: true });
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
  await expect(page.getByLabel('Карточка узла', { exact: true }).getByRole('alert')).toContainText('Такого gid нет'); await expect(search).toHaveValue('999');
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
test('directed graph table, selection, boundary, repeated selection and isolated seed', async ({ page }) => {
  await page.goto('/'); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(B); await search.press('Enter');
  await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /2 узлов, 1 связей/);
  await expect(page.getByText('Показано 2 из 2 узлов', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/b2-directed.png', fullPage: true });
  // Real canvas click: source node position was visually verified in b2-directed.png.
  const canvas = page.getByTestId('network-canvas'); const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height * .385 } });
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  await search.fill(B); await search.press('Enter');
  await search.press('Enter'); await expect(page.getByTestId('network-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Таблица связей', exact: true }).click();
  const table = page.getByRole('table').filter({ has: page.getByText('Исходные направления в срезе') });
  await expect(table).toContainText(`${A}→ ${B}`);
  await page.getByRole('table').getByRole('button', { name: A, exact: true }).click();
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  await expect(page.locator('.queue-item.selected')).toContainText(A);
  await search.fill(C); await search.press('Enter');
  await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /1 узлов, 0 связей/);
  await expect(page.getByText('В этом срезе нет наблюдаемых связей.')).toBeVisible();
  await page.screenshot({ path: 'test-results/b2-isolate.png', fullPage: true });
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор кластеров' })).toBeVisible();
});
test('truncation reports shown and matched counts honestly', async ({ page }) => {
  await page.route('**/api/v1/graph?**', async route => {
    if (new URL(route.request().url()).searchParams.get('gid') !== B) { await route.fallback(); return; }
    await route.fulfill({ json: { ...fixture.graph, truncated: true, counts: { ...fixture.graph.counts, matched_nodes: 300, matched_edges: 400 } } });
  });
  await page.goto('/'); await page.getByRole('textbox', { name: 'Поиск по полному gid' }).fill(B);
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByText('Показано 2 из 300 узлов', { exact: false })).toBeVisible();
  await expect(page.getByText(/Срез ограничен:/)).toBeVisible();
});
