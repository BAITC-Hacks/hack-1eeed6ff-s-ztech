import { openWorkspace } from '../test-support/workspace';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { A, B, C, fixture, mockApi, nodeDetail } from './fixture';

test.beforeEach(async ({ page }) => { await mockApi(page); });
for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
  test(`layout and keyboard ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size); await openWorkspace(page);
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
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await openWorkspace(page);
  await page.getByRole('list', { name: 'Очередь узлов' }).getByRole('button').filter({ has: page.getByText(A, { exact: true }) }).click();
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  await page.getByRole('button', { name: 'Скопировать полный gid' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(A);
  await page.getByRole('list', { name: 'Очередь узлов' }).getByRole('button').filter({ has: page.getByText(B, { exact: true }) }).click();
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  await page.getByRole('button', { name: 'Скопировать полный gid' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(B);
  await expect(page.locator('.queue-item.selected')).toContainText(B);
});
test('empty filters, exact search beyond filters, unknown gid and isolated seed', async ({ page }) => {
  await openWorkspace(page); await page.getByLabel('Роль', { exact: true }).selectOption('transit');
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
  await openWorkspace(page); await expect(page.getByRole('alert')).toContainText('Snapshot ещё не готов');
  await expect(page.getByText(A, { exact: true })).toHaveCount(0);
  failed = false; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText(A, { exact: true })).toBeVisible();
});
test('late A cannot replace B', async ({ page }) => {
  let releaseA!: () => void; const delayed = new Promise<void>(resolve => { releaseA = resolve; });
  await page.route(`**/api/v1/nodes/${A}`, async route => { await delayed; await route.fulfill({ json: nodeDetail(A) }).catch(() => {}); });
  await openWorkspace(page); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(A); await search.press('Enter'); await expect(page.getByText(`Загрузка узла ${A}…`)).toBeVisible();
  await search.fill(B); await search.press('Enter'); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  releaseA(); await expect(page.getByRole('heading', { name: B, exact: true })).toBeVisible();
});
test('directed graph table, selection, boundary, repeated selection and isolated seed', async ({ page }) => {
  await openWorkspace(page); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(B); await search.press('Enter');
  await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /2 узлов, 1 связей/);
  await expect(page.getByText('Показано 2 из 2 узлов', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/b2-directed.png', fullPage: true });
  // Real canvas click: source position was rechecked in b2-directed.png after B4 spacing/font changes.
  const canvas = page.getByTestId('network-canvas'); const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height * .25 } });
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  await search.fill(B); await search.press('Enter');
  await search.press('Enter'); await expect(page.getByTestId('network-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Таблица связей', exact: true }).click();
  await page.getByRole('button', { name: 'Связи · 1', exact: true }).click();
  const table = page.getByRole('table').filter({ has: page.getByText('Исходные направления в срезе') });
  await expect(table).toContainText(`${A}→ ${B}`);
  await page.getByRole('button', { name: 'Узлы · 2', exact: true }).click();
  await page.getByLabel('Направленный граф', { exact: true }).getByRole('table').getByRole('button', { name: A, exact: true }).click();
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
  await openWorkspace(page); await page.getByRole('textbox', { name: 'Поиск по полному gid' }).fill(B);
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByText('Показано 2 из 300 узлов', { exact: false })).toBeVisible();
  await expect(page.getByText(/Срез ограничен:/)).toBeVisible();
});
test('transfers preserve duplicate rows, whole-selection sums and direction pagination', async ({ page }) => {
  await page.route(`**/api/v1/nodes/${B}/transfers?**`, async route => {
    const url = new URL(route.request().url()); const offset = Number(url.searchParams.get('offset')); const direction = url.searchParams.get('direction');
    const rows = direction === 'out' ? [] : Array.from({ length: 52 }, (_, i) => ({ ...fixture.transfers.items[0], source_ref: `tx:synthetic000:${i}`, source_row: i }));
    await route.fulfill({ json: { ...fixture.transfers, direction, offset, items: rows.slice(offset, offset + 50), total: rows.length, sum_kzt: rows.length ? '520000.00' : '0.00', in_kzt: rows.length ? '520000.00' : '0.00', out_kzt: '0.00' } });
  });
  await openWorkspace(page); await page.getByRole('textbox', { name: 'Поиск по полному gid' }).fill(B); await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await page.getByRole('navigation', { name: 'Граф и переводы', exact: true }).getByRole('button', { name: 'Переводы', exact: true }).click();
  const transfers = page.getByLabel('Переводы выбранного узла', { exact: true });
  await expect(transfers.getByRole('row')).toHaveCount(51);
  await expect(transfers).toContainText('520\u202f000,00 ₸');
  await transfers.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(transfers.getByRole('row')).toHaveCount(3); await expect(transfers).toContainText('51–52 из 52');
  await expect(transfers).toContainText('520\u202f000,00 ₸');
  await page.getByRole('button', { name: 'Показать исходящие переводы', exact: true }).click();
  await expect(transfers.getByRole('combobox')).toHaveValue('out'); await expect(transfers).toContainText('нет наблюдаемых переводов');
  await page.getByRole('button', { name: 'Показать входящие переводы', exact: true }).click();
  await expect(transfers.getByRole('combobox')).toHaveValue('in'); await expect(transfers.getByRole('row')).toHaveCount(51);
  await transfers.getByText('Строка 0', { exact: true }).click(); await expect(transfers.getByText('tx:synthetic000:0', { exact: true })).toBeVisible();
});
test('all three CSV downloads are real files with full gids and known schemas', async ({ page }, info) => {
  await openWorkspace(page);
  for (const name of ['nodes_roles.csv', 'clusters.csv', 'top_nodes.csv']) {
    await page.getByLabel('Файл для выгрузки', { exact: true }).selectOption(name);
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
    const download = await downloading; expect(download.suggestedFilename()).toBe(name);
    const path = info.outputPath(name); await download.saveAs(path); const csv = await readFile(path, 'utf8');
    expect(csv).toContain(A); expect(csv).toContain(B);
    expect(csv.split('\n')[0]).toBe(name === 'nodes_roles.csv' ? 'gid,role,role_score,cluster_id,priority_score,evidence' : name === 'clusters.csv' ? 'cluster_id,n_nodes,n_seed,sum_kzt_internal,top_gids,hypothesis' : 'rank,gid,role,priority_score,why');
    await expect(page.getByRole('status').filter({ hasText: name })).toContainText('run_id проверен');
  }
});
test('CSV network errors can retry, and a changed snapshot clears every old panel', async ({ page }) => {
  let error = true;
  await page.route('**/api/v1/exports/nodes_roles.csv', async route => {
    if (error) { await route.fulfill({ status: 500, json: fixture.error }); return; } await route.fallback();
  });
  await openWorkspace(page); await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 500'); error = false;
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Повторить CSV', exact: true }).click(); await downloading;
  await page.route(`**/api/v1/nodes/${B}`, route => route.fulfill({ json: { ...nodeDetail(B), run_id: 'new-snapshot' } }));
  await page.getByRole('textbox', { name: 'Поиск по полному gid' }).fill(B); await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Расчёт изменился');
  await expect(page.getByTestId('node-detail')).toHaveCount(0); await expect(page.getByTestId('network-canvas')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Очередь узлов' })).toHaveCount(0);
});

test('card section links work with keyboard and keep the selected node at every desktop size', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport); await openWorkspace(page);
    const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
    await search.fill(B); await search.press('Enter');
    await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
    const links = page.getByRole('navigation', { name: 'Разделы карточки', exact: true });
    for (const [name, id] of [['Основания', 'node-evidence'], ['Альтернатива', 'node-hypotheses'], ['Ограничения', 'node-limits']]) {
      await links.getByRole('link', { name, exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(page.locator(`#${id}`)).toBeFocused();
      await expect(page.locator(`#${id} > h3`).first()).toBeInViewport();
      await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
    }
    await page.keyboard.press('Escape'); await expect(search).toBeFocused();
    await search.fill(A); await search.press('Enter');
    await expect(page.getByRole('heading', { name: A, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
});


test('theme follows system, persists a keyboard choice, and preserves the active graph without API reload', async ({ page }, info) => {
  await openWorkspace(page);
  const initial = info.project.name;
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial);
  const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(B); await search.press('Enter');
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  await expect(page.getByTestId('network-canvas')).toBeVisible();
  const canvas = await page.getByTestId('network-canvas').elementHandle();
  const calls: string[] = []; page.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });
  const toggle = page.getByRole('switch', { name: 'Тёмная тема', exact: true });
  await toggle.focus(); await page.keyboard.press('Enter');
  const next = initial === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', next);
  await expect(toggle).toHaveAttribute('aria-checked', String(next === 'dark'));
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  expect(await canvas!.evaluate(el => el.isConnected)).toBe(true);
  expect(calls).toEqual([]);
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', next);
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial);
});

test('theme remains usable when browser preference storage is blocked', async ({ page }, info) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }); });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openWorkspace(page); await expect(page.getByRole('list', { name: 'Очередь узлов' })).toBeVisible();
  await page.getByRole('switch', { name: 'Тёмная тема', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', info.project.name === 'dark' ? 'light' : 'dark');
  expect(errors).toEqual([]);
});

test('home arrow returns from a node and cluster, clears the context and keeps the theme at every size', async ({ page }, info) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport); await openWorkspace(page);
    const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
    const home = page.getByRole('button', { name: 'На главный экран', exact: true });
    await search.fill(B); await search.press('Enter');
    await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
    await page.getByRole('link', { name: 'Основания', exact: true }).click();
    await home.focus(); await page.keyboard.press('Enter');
    await expect(search).toBeFocused(); await expect(search).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Обзор кластеров', exact: true })).toBeVisible();
    await expect(page.getByTestId('node-detail')).toHaveCount(0);
    await expect(page.locator('.queue-item.selected')).toHaveCount(0);
    await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /2 кластеров, 0 связей/);
    await expect(home).toHaveCount(0); expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('html')).toHaveAttribute('data-theme', info.project.name);
    await search.fill(B); await search.press('Enter');
    await page.getByTestId('node-detail').getByRole('button', { name: /^Кластер / }).click();
    await expect(page.getByText('Приоритетные узлы кластера', { exact: true })).toBeVisible();
    await home.click();
    await expect(page.getByRole('heading', { name: 'Обзор кластеров', exact: true })).toBeVisible();
    await expect(page.getByText('Приоритетные узлы кластера', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Кластер', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('home arrow cancels a pending node and its late response cannot reopen the card', async ({ page }) => {
  let release!: () => void; let finished!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const settled = new Promise<void>(resolve => { finished = resolve; });
  await page.route(`**/api/v1/nodes/${A}`, async route => {
    await delayed;
    await route.fulfill({ json: nodeDetail(A) }).catch(() => {});
    finished();
  });
  await openWorkspace(page); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(A); await search.press('Enter');
  await expect(page.getByText(`Загрузка узла ${A}…`)).toBeVisible();
  await page.getByRole('button', { name: 'На главный экран', exact: true }).click();
  release(); await settled;
  await expect(page.getByRole('heading', { name: 'Обзор кластеров', exact: true })).toBeVisible();
  await expect(page.getByTestId('node-detail')).toHaveCount(0);
  await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /2 кластеров, 0 связей/);
  await expect(search).toHaveValue('');
});

test('graph controls preserve the camera and all data while focusing, expanding and switching tables', async ({ page }) => {
  await openWorkspace(page);
  const canvas=page.getByTestId('network-canvas');
  await expect(canvas).toBeVisible();
  const before=await canvas.getAttribute('aria-label');
  await expect(page.getByLabel('Раскладка кластеров',{exact:true})).toHaveValue('grid');
  await page.getByLabel('Раскладка кластеров',{exact:true}).selectOption('network');
  await expect(canvas).toHaveAttribute('aria-label',before!);
  await page.getByLabel('Раскладка кластеров',{exact:true}).selectOption('grid');
  await page.getByRole('button',{name:'Приблизить граф',exact:true}).click();
  await page.getByRole('button',{name:'Приблизить граф',exact:true}).click();
  const zoom=await page.getByLabel('Масштаб графа',{exact:true}).textContent();
  await page.getByRole('button',{name:'Таблица связей',exact:true}).click();
  await page.getByRole('button',{name:'Связи · 0',exact:true}).click();
  await expect(page.getByRole('table')).toContainText('Исходные направления в срезе');
  await page.getByRole('button',{name:'Показать граф',exact:true}).click();
  await expect(page.getByLabel('Масштаб графа',{exact:true})).toHaveText(zoom!);
  await page.getByLabel('Подсветить связи',{exact:true}).selectOption('c:1');
  await expect(page.locator('.graph-hint')).toContainText('Кластер 1: выделены прямые связи');
  await expect(canvas).toHaveAttribute('aria-label',before!);
  await page.getByLabel('Подписи графа',{exact:true}).selectOption('all');
  await page.getByRole('button',{name:'Развернуть граф',exact:true}).click();
  await expect(page.locator('.workspace')).toHaveClass(/graph-expanded/);
  await expect(page.getByLabel('Масштаб графа',{exact:true})).toHaveText(zoom!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Развернуть граф',exact:true})).toBeFocused();
  await expect(page.getByLabel('Масштаб графа',{exact:true})).toHaveText(zoom!);
  await page.getByRole('button',{name:'Таблица связей',exact:true}).click();
  await page.getByRole('button',{name:'Кластеры · 2',exact:true}).click();
  await page.getByRole('button',{name:'Кластер 1',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Карточка кластера',exact:true})).toBeVisible();
});


test('refresh from the narrow card returns to a usable overview', async ({page}) => {
  await page.setViewportSize({width:1024,height:768}); await openWorkspace(page);
  const search=page.getByRole('textbox',{name:'Поиск по полному gid'});
  await search.fill(B); await search.press('Enter');
  await expect(page.getByTestId('node-detail')).toBeVisible();
  await page.getByRole('button',{name:'Обновить',exact:true}).click();
  await expect(page.getByTestId('network-canvas')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Обзор кластеров',exact:true})).toBeVisible();
});
