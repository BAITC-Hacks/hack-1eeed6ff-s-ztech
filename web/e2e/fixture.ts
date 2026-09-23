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
    next_data_requests: isolated ? ['Запросить входящие операции seed.'] : fixture.node_detail.next_data_requests,
    raw_score: summary.role_score, score_caps: gid === B ? fixture.node_detail.score_caps : [],
    supporting_transfers: { ...fixture.node_detail.supporting_transfers, total: isolated ? 0 : 2, source_refs: isolated ? [] : fixture.node_detail.supporting_transfers.source_refs, url: `/api/v1/nodes/${gid}/transfers` } };
}
export async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/meta') { await route.fulfill({ json: fixture.meta }); return; }
    if (url.pathname.startsWith('/api/v1/exports/')) {
      const name = url.pathname.split('/').at(-1)!;
      const cols = name === 'nodes_roles.csv' ? ['gid', 'role', 'role_score', 'cluster_id', 'priority_score', 'evidence'] : name === 'clusters.csv' ? ['cluster_id', 'n_nodes', 'n_seed', 'sum_kzt_internal', 'top_gids', 'hypothesis'] : ['rank', 'gid', 'role', 'priority_score', 'why'];
      const records: Record<string, unknown>[] = name === 'clusters.csv' ? fixture.clusters.items : fixture.nodes.items.map((n, i) => ({ ...n, rank: i + 1, why: n.evidence }));
      const body = cols.join(',') + '\n' + records.map(n => cols.map(c => `"${String(n[c]).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
      await route.fulfill({ body, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'X-Run-Id': fixture.meta.run_id } }); return;
    }
    if (url.pathname === '/api/v1/clusters') { await route.fulfill({ json: fixture.clusters }); return; }
    if (url.pathname.startsWith('/api/v1/clusters/')) {
      const id = Number(url.pathname.split('/').at(-1)); const summary = fixture.clusters.items.find(c => c.cluster_id === id);
      await route.fulfill({ status: summary ? 200 : 404, json: summary ? { ...fixture.cluster_detail, ...summary, role_counts: { ...fixture.cluster_detail.role_counts, peripheral: summary.n_nodes }, boundary_count: id === 1 ? 1 : 0 } : fixture.error }); return;
    }
    if (url.pathname.endsWith('/transfers')) {
      const gid = url.pathname.split('/').at(-2); const direction = url.searchParams.get('direction') ?? 'all';
      const items = fixture.transfers.items.filter(t => direction === 'in' ? t.dst === gid : direction === 'out' ? t.src === gid : t.src === gid || t.dst === gid);
      const sum = items.length ? '20000.00' : '0.00';
      await route.fulfill({ json: { ...fixture.transfers, direction, items, total: items.length, sum_kzt: sum, in_kzt: gid === B ? sum : '0.00', out_kzt: gid === A ? sum : '0.00' } }); return;
    }
    if (url.pathname === '/api/v1/graph') {
      const gid = url.searchParams.get('gid'); const mode = url.searchParams.get('mode');
      if (gid && !nodeDetail(gid)) { await route.fulfill({ status: 404, json: fixture.error }); return; }
      const nodes = mode === 'overview' ? fixture.clusters.items.map(c => ({ id: `c:${c.cluster_id}`, kind: 'cluster', gid: null, cluster_id: c.cluster_id, label: `Кластер ${c.cluster_id}`, role: null, priority_score: null, boundary: false, is_seed: false, n_nodes: c.n_nodes })) : gid === C ? [{ ...fixture.graph.nodes[0], id: `n:${C}`, gid: C, label: C, cluster_id: 2, is_seed: true, priority_score: 0 }] : fixture.graph.nodes;
      const edges = mode === 'overview' || gid === C ? [] : fixture.graph.edges;
      await route.fulfill({ json: { ...fixture.graph, scope: { mode, ...(gid ? { gid, hops: Number(url.searchParams.get('hops')) } : {}), ...(mode === 'cluster' ? { cluster_id: Number(url.searchParams.get('cluster_id')) } : {}) }, nodes, edges, counts: { matched_nodes: nodes.length, shown_nodes: nodes.length, matched_edges: edges.length, shown_edges: edges.length } } }); return;
    }
    if (url.pathname === '/api/v1/nodes') {
      const items = fixture.nodes.items.filter(n => (!url.searchParams.has('role') || n.role === url.searchParams.get('role')) && (!url.searchParams.has('cluster_id') || String(n.cluster_id) === url.searchParams.get('cluster_id')) && (!url.searchParams.has('boundary') || n.flags.includes('boundary')) && (!url.searchParams.has('is_seed') || n.is_seed));
      await route.fulfill({ json: { ...fixture.nodes, items, total: items.length } }); return;
    }
    const detail = nodeDetail(url.pathname.split('/').at(-1)!);
    await route.fulfill({ status: detail ? 200 : 404, json: detail ?? fixture.error });
  });
}
