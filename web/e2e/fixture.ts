// Test transport only. Never imported by src/ or included in the production build.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../../contracts/v1.example.json', import.meta.url), 'utf8')) as typeof import('../../contracts/v1.example.json');
export { fixture };
export const [A, B, C] = fixture.nodes.items.map(n => n.gid);
export function nodeDetail(gid: string) {
  const summary = fixture.nodes.items.find(n => n.gid === gid);
  if (!summary) return null;
  const isolated = summary.flags.includes('isolated');
  return { ...fixture.node_detail, ...summary, in_degree: gid === B ? 1 : 0, out_degree: gid === A ? 1 : 0,
    in_kzt: gid === B ? '20000.00' : '0.00', out_kzt: gid === A ? '20000.00' : '0.00',
    in_tx: gid === B ? 2 : 0, out_tx: gid === A ? 2 : 0,
    limitations: isolated ? ['Тестовый контракт. Изолированный seed; входящие наблюдаются неполно.'] : fixture.node_detail.limitations,
    next_data_requests: isolated ? ['Запросить входящие операции seed.'] : fixture.node_detail.next_data_requests };
}
export async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/nodes') {
      const items = fixture.nodes.items.filter(n => (!url.searchParams.has('role') || n.role === url.searchParams.get('role')) && (!url.searchParams.has('boundary') || n.flags.includes('boundary')) && (!url.searchParams.has('is_seed') || n.is_seed));
      await route.fulfill({ json: { ...fixture.nodes, items, total: items.length } }); return;
    }
    const detail = nodeDetail(url.pathname.split('/').at(-1)!);
    await route.fulfill({ status: detail ? 200 : 404, json: detail ?? fixture.error });
  });
}
