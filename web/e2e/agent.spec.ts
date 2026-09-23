import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openWorkspace } from '../test-support/workspace';
import { mockApi, fixture, A, B } from './fixture';
const answer = () => ({ run_id: fixture.meta.run_id, model: 'synthetic-agent-test', status: 'answered', answer: 'Проверенное тестовое основание.', citations: [
  { id: 's1', kind: 'observation', text: `Тестовое наблюдение для ${B}.`, url: `/api/v1/nodes/${B}`, source_refs: ['tx:1'] },
  { id: 's2', kind: 'limitation', text: 'Тест: неполные входящие.', url: '/api/v1/meta', source_refs: [] },
], tool_trace: [{ step: 1, tool: 'get_node', arguments: { gid: B }, status: 'ok', statement_ids: ['s1', 's2'] }], usage: { model_calls: 2, input_tokens: 120, output_tokens: 40 }, limitations: ['Тестовые данные. Роли — гипотезы.'] });
async function setup(page: import('@playwright/test').Page, enabled: boolean) {
  await mockApi(page);
  await page.route('**/api/v1/meta', route => route.fulfill({ json: { ...fixture.meta, features: { ...fixture.meta.features, agent: enabled } } }));
}
test('agent disabled state is honest and opening never makes a paid request', async ({ page }) => {
  await setup(page, false); let calls = 0;
  await page.route('**/api/v1/agent/query', async route => { calls++; await route.abort(); });
  await openWorkspace(page); await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  await expect(page.getByRole('dialog', { name: 'AI-аналитик' })).toBeVisible();
  await expect(page.getByText('AI-аналитик не включён на этом сервере.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Задать вопрос', exact: true })).toBeDisabled();
  expect(calls).toBe(0); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть AI-аналитика' })).toBeFocused();
});
test('agent request shows exact context, pending state, sources, tools and saved report', async ({ page }, info) => {
  await setup(page, true); let calls = 0; let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/agent/query', async route => {
    calls++; expect(route.request().postDataJSON()).toEqual({ question: 'Какие основания?', gid: B });
    await wait; await route.fulfill({ json: answer() });
  });
  await openWorkspace(page); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(B); await search.press('Enter'); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  await page.getByLabel('Вопрос аналитику', { exact: true }).fill('Какие основания?');
  const send = page.getByRole('button', { name: 'Задать вопрос', exact: true }); await send.click();
  await expect(page.getByText('Аналитик обрабатывает вопрос…')).toBeVisible(); await expect(send).toBeDisabled();
  expect(calls).toBe(1); release();
  await expect(page.getByText(`Тестовое наблюдение для ${B}.`, { exact: true })).toBeVisible();
  await page.getByText('Вызовы инструментов (1)', { exact: true }).click();
  await expect(page.getByTestId('agent-trace')).toContainText('get_node');
  await expect(page.getByTestId('agent-trace')).toContainText(B);
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Сохранить ответ' }).click();
  const download = await downloaded; const path = info.outputPath('agent-answer.md'); await download.saveAs(path);
  const text = await readFile(path, 'utf8'); expect(text).toContain(fixture.meta.run_id); expect(text).toContain('tx:1'); expect(text).toContain('Какие основания?');
  await page.getByRole('button', { name: `Открыть узел ${B}` }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
});
test('agent busy failure retries; insufficient data is a distinct supported answer', async ({ page }) => {
  await setup(page, true); let calls = 0;
  await page.route('**/api/v1/agent/query', route => {
    calls++; return route.fulfill(calls === 1 ? { status: 429, json: { error: { code: 'AGENT_BUSY', message: 'Аналитик уже обрабатывает другой вопрос.' } } } : { json: { ...answer(), status: 'insufficient_data' } });
  });
  await openWorkspace(page); await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  await page.getByLabel('Вопрос аналитику', { exact: true }).fill('Чего не хватает?');
  await page.getByRole('button', { name: 'Задать вопрос', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('другой вопрос');
  await page.getByRole('button', { name: 'Задать вопрос', exact: true }).click();
  await expect(page.getByText('Данных недостаточно для полного ответа.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Источник s1' })).toHaveAttribute('href', `/api/v1/nodes/${B}`);
});
test('agent snapshot mismatch clears stale evidence and requires refresh', async ({ page }) => {
  await setup(page, true);
  await page.route('**/api/v1/agent/query', route => route.fulfill({ json: { ...answer(), run_id: 'changed-run' } }));
  await openWorkspace(page); await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  await page.getByLabel('Вопрос аналитику', { exact: true }).fill('Вопрос'); await page.getByRole('button', { name: 'Задать вопрос', exact: true }).click();
  await expect(page.getByText(/Расчёт изменился/).first()).toBeVisible();
  await expect(page.getByText(`Тестовое наблюдение для ${B}.`, { exact: true })).toHaveCount(0);
});
test('agent panel fits desktop sizes and closing preserves the selected graph', async ({ page }, info) => {
  await setup(page, true); await openWorkspace(page);
  const search = page.getByRole('textbox', { name: 'Поиск по полному gid' }); await search.fill(A); await search.press('Enter');
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport); await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
    await expect(page.getByLabel('Вопрос аналитику', { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Задать вопрос', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`agent-${viewport.width}.png`), fullPage: true });
    await page.keyboard.press('Escape'); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  }
});

test('agent pending request survives closing and reopening without a second charge', async ({ page }) => {
  await setup(page, true); let calls = 0; let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/agent/query', async route => { calls++; await wait; await route.fulfill({ json: answer() }); });
  await openWorkspace(page); const trigger = page.getByRole('button', { name: 'Открыть AI-аналитика' });
  const bounds = await trigger.boundingBox(); expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!; expect(bounds!.x).toBeGreaterThan(viewport.width - 240); expect(bounds!.y).toBeGreaterThan(viewport.height - 100);
  await trigger.click(); await page.getByLabel('Вопрос аналитику', { exact: true }).fill('Проверь основания');
  await page.getByRole('button', { name: 'Задать вопрос', exact: true }).click();
  await expect(page.getByText('Аналитик обрабатывает вопрос…')).toBeVisible();
  await page.keyboard.press('Escape'); await trigger.click();
  await expect(page.getByText('Аналитик обрабатывает вопрос…')).toBeVisible();
  expect(calls).toBe(1); release();
  await expect(page.getByText(`Тестовое наблюдение для ${B}.`, { exact: true })).toBeVisible(); expect(calls).toBe(1);
});
test('agent never shows a late answer after the selected context changes', async ({ page }) => {
  await setup(page, true); let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/agent/query', async route => { await wait; await route.fulfill({ json: answer() }).catch(() => {}); });
  await openWorkspace(page); const search = page.getByRole('textbox', { name: 'Поиск по полному gid' });
  await search.fill(B); await search.press('Enter'); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  await page.getByLabel('Вопрос аналитику', { exact: true }).fill('Проверь основания');
  await page.getByRole('button', { name: 'Задать вопрос', exact: true }).click();
  await expect(page.getByText('Аналитик обрабатывает вопрос…')).toBeVisible(); await page.keyboard.press('Escape');
  await search.fill(A); await search.press('Enter'); await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', A);
  release(); await page.getByRole('button', { name: 'Открыть AI-аналитика' }).click();
  await expect(page.getByRole('dialog')).toContainText(A);
  await expect(page.getByText(`Тестовое наблюдение для ${B}.`, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Аналитик обрабатывает вопрос…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Задать вопрос', exact: true })).toBeEnabled();
});

test('role legend is readable and AI dock does not cover the workspace', async ({ page }) => {
  await setup(page, true); await openWorkspace(page);
  const search = page.getByRole('textbox', { name: 'Поиск по полному gid' }); await search.fill(B); await search.press('Enter');
  await expect(page.getByTestId('node-detail')).toHaveAttribute('data-gid', B);
  for (const viewport of [{ width:1440,height:900 }, { width:1280,height:800 }, { width:1024,height:768 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width <= 1050) await page.getByRole('button', { name:'Сеть', exact:true }).click();
    const legend = page.locator('.role-legend');
    if ((await legend.getAttribute('open')) === null) await legend.locator('summary').click();
    await expect(legend.locator('.role')).toHaveCount(6); await expect(legend).toBeInViewport();
    const button = await page.getByRole('button', { name:'Открыть AI-аналитика' }).boundingBox();
    const workspace = await page.getByRole('main').boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(workspace!.y + workspace!.height);
  }
});

test('expanded graph hides AI dock and Escape restores its entry', async ({ page }) => {
  await setup(page, true); await openWorkspace(page);
  await page.getByRole('button', { name: 'Развернуть граф', exact:true }).click();
  await expect(page.getByRole('button', { name:'Открыть AI-аналитика' })).toBeHidden();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name:'Открыть AI-аналитика' })).toBeVisible();
});
