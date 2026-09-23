import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openWorkspace } from '../test-support/workspace';
import { parseMeta, parseNodePage, parseNodeDetail, parseTransfers } from '../src/contract';
import { roles, formatKzt } from '../src/domain';

// Exercise real UI controls against the local API. No routes or paid requests.
test('audit all main control groups with real data, including disabled AI and pagination', async ({ page, request }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  let paidRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/api/v1/agent/query')) paidRequests++; });
  const meta = parseMeta(await (await request.get('/api/v1/meta')).json());
  const top = parseNodePage(await (await request.get('/api/v1/nodes?limit=50')).json());
  const node = parseNodeDetail(await (await request.get(`/api/v1/nodes/${top.items[0].gid}`)).json());
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Ограничения', exact: true }).click();
  await expect(page.locator('.dataset-limits')).toBeVisible();
  await page.getByRole('button', { name: 'Ограничения', exact: true }).click();
  const queue = page.getByLabel('Приоритеты', { exact: true });
  for (const role of roles) {
    const filtered = parseNodePage(await (await request.get(`/api/v1/nodes?role=${role}&limit=50`)).json());
    await page.getByLabel('Роль', { exact: true }).selectOption(role);
    await expect(queue.locator('.count-chip')).toHaveText(String(filtered.total));
    if (filtered.items.length) await expect(queue.locator('.queue-item').first()).toContainText(filtered.items[0].gid);
  }
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await expect(queue.locator('.count-chip')).toHaveText(String(top.total));
  await queue.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(queue.locator('.pagination')).toContainText('51–100');
  await queue.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(queue.locator('.pagination')).toContainText('1–50');
  for (const [label, parameter] of [['Граница выборки', 'boundary'], ['Только seed', 'is_seed']]) {
    const filtered = parseNodePage(await (await request.get(`/api/v1/nodes?${parameter}=true&limit=50`)).json());
    await page.getByLabel(label, { exact: true }).check();
    await expect(queue.locator('.count-chip')).toHaveText(String(filtered.total));
    await expect(queue.locator('.queue-item').first()).toContainText(filtered.items[0].gid);
    await page.getByLabel(label, { exact: true }).uncheck();
  }
  await page.getByLabel('Кластер', { exact: true }).selectOption(String(node.cluster_id));
  const scoped = parseNodePage(await (await request.get(`/api/v1/nodes?cluster_id=${node.cluster_id}`)).json());
  await expect(queue.locator('.count-chip')).toHaveText(String(scoped.total));
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  for (const invalid of ['0', '-1', '9223372036854775808', '<script>alert(1)</script>']) {
    await search.fill(invalid); await search.press('Enter');
    await expect(search).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#search-error')).toBeVisible();
  }
  await page.getByLabel('Только seed', { exact: true }).check();
  await search.fill(node.gid); await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByLabel('Только seed', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Закрыть уведомление', exact: true }).click();
  const detail = page.getByTestId('node-detail');
  await expect(detail).toHaveAttribute('data-gid', node.gid);
  for (const label of ['Основания', 'Альтернатива', 'Ограничения']) {
    await detail.getByRole('link', { name: label, exact: true }).click();
    await expect(detail).toHaveAttribute('data-gid', node.gid);
  }
  await detail.getByText(/^Все проверенные роли/).click();
  await expect(detail.locator('.candidate')).toHaveCount(node.candidates.length);
  await page.getByLabel('Число шагов графа', { exact: true }).selectOption('2');
  await expect(page.getByTestId('network-canvas')).toBeVisible();
  await page.getByLabel('Число шагов графа', { exact: true }).selectOption('1');
  for (const button of ['Приблизить граф', 'Отдалить граф', 'Вместить']) {
    await page.getByRole('button', { name: button, exact: true }).click();
  }
  await page.getByLabel('Подписи графа', { exact: true }).selectOption('all');
  await page.getByLabel('Подписи графа', { exact: true }).selectOption('auto');
  await page.locator('.role-legend summary').click();
  await expect(page.locator('.role-legend .role')).toHaveCount(6);
  await page.locator('.role-legend summary').click();
  await page.getByRole('button', { name: 'Развернуть граф', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть граф', exact: true }).click();
  await detail.getByRole('button', { name: 'Показать исходящие переводы', exact: true }).click();
  const transfers = page.getByLabel('Переводы выбранного узла', { exact: true });
  await expect(transfers.getByRole('table')).toBeVisible();
  for (const direction of ['in', 'out', 'all']) {
    const actual = parseTransfers(await (await request.get(`/api/v1/nodes/${node.gid}/transfers?direction=${direction}&limit=50`)).json());
    await page.getByLabel('Направление переводов', { exact: true }).selectOption(direction);
    await expect(transfers.locator('.transfer-toolbar')).toContainText(formatKzt(actual.sum_kzt));
    await expect(transfers.locator('tbody tr')).toHaveCount(actual.items.length);
  }
  await transfers.locator('summary').first().click();
  await expect(transfers.locator('details').first()).toHaveAttribute('open', '');
  let paginatedNode = node;
  for (const candidate of top.items) {
    paginatedNode = parseNodeDetail(await (await request.get(`/api/v1/nodes/${candidate.gid}`)).json());
    if (paginatedNode.supporting_transfers.total > 50) break;
  }
  expect(paginatedNode.supporting_transfers.total).toBeGreaterThan(50);
  await search.fill(paginatedNode.gid); await search.press('Enter');
  await expect(detail).toHaveAttribute('data-gid', paginatedNode.gid);
  await page.getByRole('button', { name: 'Переводы', exact: true }).click();
  await page.getByLabel('Направление переводов', { exact: true }).selectOption('all');
  const firstPage = parseTransfers(await (await request.get(`/api/v1/nodes/${paginatedNode.gid}/transfers?direction=all&limit=50`)).json());
  const secondPage = parseTransfers(await (await request.get(`/api/v1/nodes/${paginatedNode.gid}/transfers?direction=all&offset=50&limit=50`)).json());
  const transferTotal = formatKzt(firstPage.sum_kzt);
  await expect(transfers.locator('.transfer-toolbar')).toContainText(transferTotal);
  await transfers.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(transfers.locator('.pagination')).toContainText('51–');
  await expect(transfers.locator('.transfer-toolbar')).toContainText(transferTotal);
  await expect(transfers.locator('tbody tr').first()).toHaveAttribute('id', secondPage.items[0].source_ref);
  await transfers.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(transfers.locator('.pagination')).toContainText('1–50');
  await expect(transfers.locator('tbody tr').first()).toHaveAttribute('id', firstPage.items[0].source_ref);
  await page.getByRole('button', { name: 'Вместе', exact: true }).click();
  await expect(page.getByTestId('network-canvas')).toBeVisible();
  await expect(transfers).toBeVisible();
  await page.getByRole('button', { name: 'Граф', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI-аналитик' });
  await dialog.getByText('Какие вопросы поддерживаются', { exact: true }).click();
  await dialog.getByLabel(/Учитывать выбранный узел/).uncheck();
  await dialog.getByLabel(/Учитывать выбранный узел/).check();
  for (const prompt of ['Разобрать гипотезу', 'Проверить переводы', 'Следующий шаг']) {
    await dialog.getByRole('button', { name: prompt, exact: true }).click();
    await expect(page.getByLabel('Вопрос аналитику', { exact: true })).not.toHaveValue('');
  }
  if (!meta.features.agent) {
    await expect(dialog.getByRole('button', { name: 'Задать вопрос', exact: true })).toBeDisabled();
    await dialog.getByText('Как включить', { exact: true }).click();
  }
  await page.getByRole('button', { name: 'Закрыть AI-аналитика' }).click();
  await expect(page.getByRole('button', { name: 'Открыть AI-аналитика' })).toBeFocused();
  await detail.getByRole('button', { name: /^Кластер / }).click();
  await expect(page.getByRole('heading', { name: 'Карточка кластера', exact: true })).toBeVisible();
  const clusterNode = page.locator('.detail-panel').getByRole('button', { name: /^\d+$/ }).first();
  const clusterGid = await clusterNode.innerText();
  await clusterNode.click();
  await expect(detail).toHaveAttribute('data-gid', clusterGid);
  await page.getByRole('button', { name: 'На главный экран', exact: true }).click();
  for (const layout of ['network', 'grid']) {
    await page.getByLabel('Раскладка кластеров', { exact: true }).selectOption(layout);
    await expect(page.getByTestId('network-canvas')).toHaveAttribute('aria-label', /89 кластеров, 210 связей/);
  }
  await page.getByLabel('Подсветить связи', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Таблица связей', exact: true }).click();
  await page.getByRole('button', { name: 'Связи · 210', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Исходные направления в срезе', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Кластеры · 89', exact: true }).click();
  await page.getByRole('button', { name: 'Показать граф', exact: true }).click();
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByTestId('network-canvas')).toBeVisible();
  expect(errors).toEqual([]); expect(paidRequests).toBe(0);
  await page.screenshot({ path: info.outputPath('audit-controls.png'), animations: 'disabled', fullPage: true });
  await writeFile(info.outputPath('audit-controls.json'), JSON.stringify({ run_id: meta.run_id, paginatedGid: paginatedNode.gid, transfers: paginatedNode.supporting_transfers.total, paidRequests, pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2));
});
