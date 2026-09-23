import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../contracts/v1.example.json';
import { ApiSession, LatestRequest, requestJson, SnapshotChanged } from './api';
import { parseClusterDetail, parseClusters, parseGraph, parseMeta, parseNodeDetail, parseNodePage, parseTransfers } from './contract';
import { emptyFilters, formatKzt, validGid } from './domain';

afterEach(() => vi.unstubAllGlobals());
describe('published contract v1', () => {
  it('preserves neighbouring long gids through the actual API parser', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture.nodes))));
    const page = await new ApiSession().nodes(emptyFilters, 0, new AbortController().signal);
    expect(page.items.slice(0, 2).map(n => n.gid)).toEqual(['900000000000000001', '900000000000000002']);
    expect(new Set(page.items.map(n => n.gid)).size).toBe(3);
  });
  it('rejects a numeric gid, including an already-rounded unsafe integer', () => {
    expect(() => parseNodePage({ ...fixture.nodes, items: [{ ...fixture.nodes.items[0], gid: Number(fixture.nodes.items[0].gid) }] })).toThrow(/gid/);
  });
  it('accepts boundary detail without converting money to float', () => {
    const node = parseNodeDetail(fixture.node_detail);
    expect(node.flags).toContain('boundary'); expect(node.in_kzt).toBe('20000.00');
    expect(formatKzt('9007199254740993.01')).toBe('9\u202f007\u202f199\u202f254\u202f740\u202f993,01 ₸');
  });
  it('validates gid range without numeric coercion', () => {
    expect(validGid('9223372036854775807')).toBe(true);
    for (const input of ['9223372036854775808', '1e18', '-1', '', '12.0', ' 12', 123]) expect(validGid(input)).toBe(false);
  });
  it('rejects non-contract money and nonfinite scores', () => {
    expect(() => parseNodeDetail({ ...fixture.node_detail, in_kzt: 20000 })).toThrow(/in_kzt/);
    expect(() => parseNodeDetail({ ...fixture.node_detail, priority_score: NaN })).toThrow(/priority_score/);
  });
  it('preserves directed endpoints and rejects dangling edges', () => {
    const graph = parseGraph(fixture.graph);
    expect(graph.edges[0].source).toBe('n:900000000000000001');
    expect(graph.edges[0].target).toBe('n:900000000000000002');
    expect(() => parseGraph({ ...fixture.graph, nodes: [] })).toThrow(/endpoint/);
  });
  it('rejects an ego response which omits its root', () => {
    expect(() => parseGraph({ ...fixture.graph, scope: { ...fixture.graph.scope, gid: '900000000000000003' } })).toThrow(/root/);
  });
  it('invalidates the whole session on a different run', () => {
    const api = new ApiSession(); api.accept({ run_id: 'A' });
    expect(() => api.accept({ run_id: 'B' })).toThrow(SnapshotChanged);
    expect(() => api.accept({ run_id: 'A' })).toThrow(SnapshotChanged);
  });
  it('cannot let a late A replace the active B, even if transport ignores abort', async () => {
    const requests = new LatestRequest(); let resolveA!: (id: string) => void; let current = '';
    const a = requests.start();
    const completion = new Promise<string>(resolve => { resolveA = resolve; }).then(value => { if (a.isCurrent()) current = value; });
    const b = requests.start(); if (b.isCurrent()) current = 'B';
    resolveA('A'); await completion;
    expect(a.signal.aborted).toBe(true); expect(current).toBe('B');
    requests.cancel(); expect(b.isCurrent()).toBe(false);
  });
  it('reports API errors without returning fixture data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture.error), { status: 404 })));
    await expect(requestJson('/api/v1/nodes/123')).rejects.toMatchObject({ status: 404, code: 'NODE_NOT_FOUND' });
  });
  it('reports invalid HTML responses and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>no backend</html>')));
    await expect(requestJson('/api/v1/nodes')).rejects.toThrow(/JSON/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(requestJson('/api/v1/nodes')).rejects.toThrow(/локальным API/);
  });
  it('rejects a response for another exact gid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture.node_detail))));
    await expect(new ApiSession().node('900000000000000001', new AbortController().signal)).rejects.toMatchObject({ code: 'GID_MISMATCH' });
  });
  it('parses meta, clusters and source rows without collapsing repeated transfers', () => {
    expect(parseMeta(fixture.meta).counts.nodes).toBe(3);
    expect(parseClusters(fixture.clusters).items).toHaveLength(2);
    expect(parseClusterDetail(fixture.cluster_detail).n_nodes).toBe(2);
    const page = parseTransfers(fixture.transfers);
    expect(page.items).toHaveLength(2); expect(page.items[0].sum_kzt).toBe(page.items[1].sum_kzt);
    expect(page.items[0].source_ref).not.toBe(page.items[1].source_ref);
  });
  it('rejects transfers returned for the wrong node or direction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture.transfers))));
    await expect(new ApiSession().transfers('123', 'all', 0, new AbortController().signal)).rejects.toMatchObject({ code: 'TRANSFER_SCOPE_MISMATCH' });
  });
  it('does not replace full-selection totals with sums of a page', () => {
    const value = parseTransfers({ ...fixture.transfers, total: 100, sum_kzt: '1000000.00' });
    expect(value.items).toHaveLength(2); expect(value.total).toBe(100); expect(value.sum_kzt).toBe('1000000.00');
  });
  it('refuses a CSV with a different run_id or missing provenance', async () => {
    const api = new ApiSession(); api.accept({ run_id: 'current' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gid,role\n', { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment', 'X-Run-Id': 'other' } })));
    await expect(api.download('nodes_roles.csv', new AbortController().signal)).rejects.toThrow(SnapshotChanged);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gid,role\n', { headers: { 'content-type': 'text/csv' } })));
    await expect(new ApiSession().download('nodes_roles.csv', new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_EXPORT_RESPONSE' });
  });
});
