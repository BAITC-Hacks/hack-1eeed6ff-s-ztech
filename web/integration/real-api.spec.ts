import { openWorkspace } from '../test-support/workspace';
// No fixture imports or response substitutions. Requires an actual running backend.
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseNodeDetail, parseNodePage, parseGraph, parseMeta, parseTransfers } from '../src/contract';
import { exportNames, formatKzt, score } from '../src/domain';

test('real data at three desktop sizes; exact search, graph and evidence', async ({ page, request }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const meta = parseMeta(await (await request.get('/api/v1/meta')).json());
  const nodes = parseNodePage(await (await request.get('/api/v1/nodes?limit=50')).json());
  const node = parseNodeDetail(await (await request.get(`/api/v1/nodes/${nodes.items[0].gid}`)).json());
  const graph = parseGraph(await (await request.get(`/api/v1/graph?mode=ego&gid=${node.gid}&hops=1&limit=250`)).json());
  expect(node.run_id).toBe(meta.run_id);
  for (const theme of ['light', 'dark']) for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport); await openWorkspace(page);
    const themeSwitch = page.getByRole('switch', { name: 'Тёмная тема', exact: true });
    if ((await themeSwitch.getAttribute('aria-checked')) !== String(theme === 'dark')) await themeSwitch.click();
    await expect(page.getByText(/Тестовый контракт ·/)).toHaveCount(0);
    await expect(page.locator('.status-strip')).toContainText(formatKzt(meta.total_kzt));
    const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
    await search.fill(node.gid); await search.press('Enter');
    const detail = page.getByTestId('node-detail'); await expect(detail).toHaveAttribute('data-gid', node.gid);
    await expect(detail).toContainText(node.evidence); await expect(detail).toContainText(score(node.priority_score));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`real-card-${theme}-${viewport.width}.png`), fullPage: true });
    if (viewport.width <= 1050) await page.getByRole('button', { name: 'Сеть', exact: true }).click();
    await expect(page.getByTestId('network-canvas')).toBeVisible();
    await expect(page.getByLabel('Направленный граф', { exact: true })).toContainText(`Показано ${graph.counts.shown_nodes} из ${graph.counts.matched_nodes} узлов`);
    const graphCounts = page.locator('.graph-counts'); await expect(graphCounts).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`real-network-${theme}-${viewport.width}.png`), fullPage: true });
    await page.getByRole('navigation', { name: 'Граф и переводы', exact: true }).getByRole('button', { name: 'Переводы', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Исходные переводы' })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`real-transfers-${theme}-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'На главный экран', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Обзор кластеров', exact: true })).toBeVisible();
    await expect(page.getByTestId('network-canvas')).toBeVisible();
    await expect(page.getByTestId('node-detail')).toHaveCount(0);
    await expect(search).toHaveValue('');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('run.json'), JSON.stringify({ run_id: meta.run_id, counts: meta.counts, gid: node.gid, checkedAt: new Date().toISOString() }, null, 2));
});

test('real boundary, isolated seed, arbitrary gids, source totals and cluster', async ({ page, request }, info) => {
  const boundary = parseNodePage(await (await request.get('/api/v1/nodes?boundary=true&limit=1')).json()).items[0];
  const seeds = parseNodePage(await (await request.get('/api/v1/nodes?is_seed=true&limit=200')).json());
  const isolated = seeds.items.find(node => node.flags.includes('isolated'))!;
  expect(isolated).toBeTruthy(); await openWorkspace(page);
  const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  for (const theme of ['light', 'dark']) for (const node of [boundary, isolated]) {
    const themeSwitch = page.getByRole('switch', { name: 'Тёмная тема', exact: true });
    if ((await themeSwitch.getAttribute('aria-checked')) !== String(theme === 'dark')) await themeSwitch.click();
    await search.fill(node.gid); await search.press('Enter');
    await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', node.gid);
    await expect(page.getByTestId('node-detail')).toContainText(node === boundary ? 'Граница выборки' : 'Изолированный узел');
    if (node === isolated) await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /1 узлов, 0 связей/);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(node === boundary ? `real-boundary-${theme}.png` : `real-isolate-${theme}.png`), fullPage: true });
  }
  const arbitrary = parseNodePage(await (await request.get('/api/v1/nodes?offset=537&limit=3')).json());
  for (const row of arbitrary.items) {
    const actual = parseNodeDetail(await (await request.get(`/api/v1/nodes/${row.gid}`)).json());
    await search.fill(row.gid); await search.press('Enter');
    await expect(page.getByTestId('node-detail')).toContainText(actual.evidence);
    await expect(page.locator('.queue-item.selected')).toContainText(row.gid);
    await page.getByRole('button', { name: 'Показать входящие переводы', exact: true }).click();
    const transfers = parseTransfers(await (await request.get(`/api/v1/nodes/${row.gid}/transfers?direction=in&offset=0&limit=50`)).json());
    await expect(page.getByLabel('Переводы выбранного узла', { exact: true })).toContainText(formatKzt(transfers.sum_kzt));
    expect(transfers.sum_kzt).toBe(actual.in_kzt);
  }
  await page.getByTestId('node-detail').getByRole('button', { name: /^Кластер / }).click();
  await expect(page.getByText('Приоритетные узлы кластера', { exact: true })).toBeVisible();
});

test('real CSV downloads match the API and published result files byte for byte', async ({ page, request }, info) => {
  const meta = parseMeta(await (await request.get('/api/v1/meta')).json()); await openWorkspace(page);
  const evidence: Record<string, string> = {};
  for (const name of exportNames) {
    await page.getByLabel('Файл для выгрузки', { exact: true }).selectOption(name);
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
    const download = await event; expect(download.suggestedFilename()).toBe(name);
    const path = info.outputPath(name); await download.saveAs(path); const bytes = await readFile(path);
    const response = await request.get(`/api/v1/exports/${name}`); expect(response.headers()['x-run-id']).toBe(meta.run_id);
    expect(bytes.equals(await response.body())).toBe(true);
    const disk = await readFile(resolve(process.env.NEVERLOSE_RESULTS ?? '../results', name));
    expect(bytes.equals(disk)).toBe(true); evidence[name] = createHash('sha256').update(bytes).digest('hex');
    await page.getByRole('button', { name: 'Закрыть сообщение выгрузки', exact: true }).click();
    await expect(page.locator('.export-message')).toHaveCount(0);
  }
  await writeFile(info.outputPath('download-hashes.json'), JSON.stringify({ run_id: meta.run_id, sha256: evidence }, null, 2));
});

test('real entry and broad cluster overview, focus and expanded graph in both themes', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Открыть платформу',exact:true})).toBeVisible();
  for(const theme of ['light','dark']) {
    const toggle=page.getByRole('switch',{name:'Тёмная тема',exact:true});
    if((await toggle.getAttribute('aria-checked'))!==String(theme==='dark')) await toggle.click();
    await page.screenshot({ animations: 'disabled',path:info.outputPath(`welcome-${theme}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'Открыть платформу',exact:true}).click();
  await expect(page.getByTestId('network-canvas')).toBeVisible();
  for(const theme of ['light','dark']) {
    const toggle=page.getByRole('switch',{name:'Тёмная тема',exact:true});
    if((await toggle.getAttribute('aria-checked'))!==String(theme==='dark')) await toggle.click();
    await page.screenshot({ animations: 'disabled',path:info.outputPath(`overview-${theme}.png`),fullPage:true});
  }
  const canvas=page.getByTestId('network-canvas');
  const counts=await canvas.getAttribute('aria-label');
  await page.getByLabel('Раскладка кластеров',{exact:true}).selectOption('network');
  await expect(canvas).toHaveAttribute('aria-label',counts!);
  await page.screenshot({ animations: 'disabled',path:info.outputPath('overview-network.png'),fullPage:true});
  await page.getByLabel('Раскладка кластеров',{exact:true}).selectOption('grid');
  const focus=page.getByLabel('Подсветить связи',{exact:true});
  await focus.selectOption({index:1});
  await expect(page.locator('.graph-hint')).toContainText('выделены прямые связи');
  await page.screenshot({ animations: 'disabled',path:info.outputPath('overview-focused.png'),fullPage:true});
  await page.getByRole('button',{name:'Развернуть граф',exact:true}).click();
  await expect(page.locator('.workspace')).toHaveClass(/graph-expanded/);
  await page.screenshot({ animations: 'disabled',path:info.outputPath('overview-expanded.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace')).not.toHaveClass(/graph-expanded/);
});
