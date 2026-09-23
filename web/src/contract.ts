import { roles, validGid, type NodePage, type NodeDetail, type NodeSummary, type GraphResponse, type Meta, type TransferPage, type ClusterPage, type ClusterDetail } from './domain';

export class ContractError extends Error {
  constructor(path: string) { super(`Ответ API не соответствует контракту v1: ${path}.`); this.name = 'ContractError'; }
}
type Obj = Record<string, unknown>;
export function object(value: unknown, path: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError(path);
  return value as Obj;
}
function requireValue(ok: boolean, path: string): asserts ok { if (!ok) throw new ContractError(path); }
function text(o: Obj, key: string) { requireValue(typeof o[key] === 'string' && (o[key] as string).length > 0, key); }
function num(o: Obj, key: string, integer = false) {
  requireValue(typeof o[key] === 'number' && Number.isFinite(o[key]) && (o[key] as number) >= 0 && (!integer || Number.isSafeInteger(o[key])), key);
}
function bool(o: Obj, key: string) { requireValue(typeof o[key] === 'boolean', key); }
function arr(o: Obj, key: string): unknown[] { requireValue(Array.isArray(o[key]), key); return o[key] as unknown[]; }
function strings(o: Obj, key: string) { requireValue(arr(o, key).every(v => typeof v === 'string'), key); }
function role(v: unknown) { requireValue(roles.includes(v as typeof roles[number]), 'role'); }
function bounded(o: Obj, key: string) { num(o, key); requireValue((o[key] as number) <= 1, key); }
function money(o: Obj, key: string) { requireValue(typeof o[key] === 'string' && /^\d+\.\d{2}$/.test(o[key] as string), key); }
function gid(v: unknown, path = 'gid') { requireValue(validGid(v), path); }
function nullableNumber(o: Obj, key: string) { if (o[key] !== null) num(o, key); }
const flags = ['boundary', 'isolated', 'seed_inflow_incomplete', 'out_exceeds_in', 'low_observation'];

export function parseSummary(value: unknown): NodeSummary {
  const o = object(value, 'node');
  gid(o.gid); role(o.role); bounded(o, 'role_score'); bounded(o, 'priority_score');
  num(o, 'cluster_id', true); num(o, 'depth', true); bool(o, 'is_seed'); text(o, 'evidence');
  requireValue((o.cluster_id as number) > 0, 'cluster_id');
  requireValue(arr(o, 'flags').every(f => typeof f === 'string' && flags.includes(f)), 'flags');
  return o as NodeSummary;
}
export function parseNodePage(value: unknown): NodePage {
  const o = object(value, 'nodes'); text(o, 'run_id');
  const items = arr(o, 'items').map(parseSummary);
  num(o, 'total', true); num(o, 'offset', true); num(o, 'limit', true);
  requireValue((o.limit as number) >= 1 && (o.limit as number) <= 200 && items.length <= (o.limit as number), 'pagination');
  requireValue(new Set(items.map(n => n.gid)).size === items.length, 'duplicate gid');
  requireValue((o.total as number) >= (o.offset as number) + items.length || items.length === 0, 'total');
  return { ...o, items } as NodePage;
}
export function parseNodeDetail(value: unknown): NodeDetail {
  parseSummary(value); const o = object(value, 'detail');
  text(o, 'run_id'); text(o, 'role_rule_id');
  for (const key of ['in_degree', 'out_degree', 'in_tx', 'out_tx', 'seed_reach_count']) num(o, key, true);
  for (const key of ['pagerank', 'betweenness', 'participation']) num(o, key);
  money(o, 'in_kzt'); money(o, 'out_kzt'); nullableNumber(o, 'observed_ratio');
  strings(o, 'limitations'); strings(o, 'next_data_requests');
  for (const candidate of arr(o, 'candidates')) {
    const c = object(candidate, 'candidate'); role(c.role); bool(c, 'eligible');
    bounded(c, 'raw_score'); bounded(c, 'capped_score');
    for (const check of arr(c, 'checks')) {
      const r = object(check, 'check'); text(r, 'key'); text(r, 'operator'); text(r, 'text'); bool(r, 'passed');
      nullableNumber(r, 'actual'); nullableNumber(r, 'threshold');
    }
  }
  for (const contribution of arr(o, 'priority_contributions')) {
    const c = object(contribution, 'contribution'); text(c, 'key'); text(c, 'label');
    for (const key of ['raw', 'normalized', 'weight', 'contribution']) num(c, key);
  }
  bounded(o, 'raw_score');
  for (const item of arr(o, 'score_caps')) { const cap = object(item, 'score_cap'); text(cap, 'key'); text(cap, 'reason'); bounded(cap, 'cap'); }
  const supporting = object(o.supporting_transfers, 'supporting_transfers');
  num(supporting, 'total', true); strings(supporting, 'source_refs');
  requireValue(supporting.url === `/api/v1/nodes/${o.gid}/transfers`, 'supporting_transfers.url');
  if (o.alternative !== null) {
    const alternative = object(o.alternative, 'alternative');
    role(alternative.role); bool(alternative, 'eligible'); bounded(alternative, 'raw_score'); bounded(alternative, 'capped_score');
    for (const item of arr(alternative, 'checks')) { const c = object(item, 'alternative.check'); text(c, 'key'); text(c, 'operator'); text(c, 'text'); bool(c, 'passed'); nullableNumber(c, 'actual'); nullableNumber(c, 'threshold'); }
  }
  return o as NodeDetail;
}
export function parseGraph(value: unknown): GraphResponse {
  const o = object(value, 'graph'); text(o, 'run_id'); bool(o, 'truncated');
  const scope = object(o.scope, 'scope'); requireValue(['ego', 'overview', 'cluster'].includes(scope.mode as string), 'scope.mode');
  if (scope.mode === 'ego') { gid(scope.gid); requireValue(scope.hops === 1 || scope.hops === 2, 'scope.hops'); }
  if (scope.mode === 'cluster') num(scope, 'cluster_id', true);
  const nodes = arr(o, 'nodes').map(v => {
    const n = object(v, 'graph.node'); text(n, 'id'); text(n, 'label');
    requireValue(n.kind === 'node' || n.kind === 'cluster', 'node.kind');
    num(n, 'cluster_id', true); bool(n, 'boundary'); bool(n, 'is_seed'); num(n, 'n_nodes', true);
    if (n.kind === 'node') { gid(n.gid); role(n.role); bounded(n, 'priority_score'); requireValue(n.id === `n:${n.gid}`, 'node.id'); }
    else { requireValue(n.gid === null && n.role === null && n.priority_score === null && n.id === `c:${n.cluster_id}`, 'cluster node'); }
    return n;
  });
  const ids = new Set(nodes.map(n => n.id)); requireValue(ids.size === nodes.length, 'duplicate graph node');
  const edges = arr(o, 'edges').map(v => {
    const e = object(v, 'graph.edge'); text(e, 'id'); money(e, 'sum_kzt'); num(e, 'n_tx', true);
    requireValue(ids.has(e.source) && ids.has(e.target), 'edge endpoint'); return e;
  });
  requireValue(new Set(edges.map(e => e.id)).size === edges.length, 'duplicate edge');
  const counts = object(o.counts, 'counts');
  for (const key of ['shown_nodes', 'matched_nodes', 'shown_edges', 'matched_edges']) num(counts, key, true);
  requireValue(counts.shown_nodes === nodes.length && counts.shown_edges === edges.length && (counts.matched_nodes as number) >= nodes.length && (counts.matched_edges as number) >= edges.length, 'graph counts');
  requireValue(o.truncated === ((counts.matched_nodes as number) > nodes.length || (counts.matched_edges as number) > edges.length), 'graph truncated');
  if (scope.mode === 'ego') requireValue(ids.has(`n:${scope.gid}`), 'missing ego root');
  return o as GraphResponse;
}

export function parseMeta(value: unknown): Meta {
  const o = object(value, 'meta'); text(o, 'run_id'); text(o, 'config_version'); text(o, 'algorithm_version');
  requireValue(o.schema_version === '1', 'schema_version'); money(o, 'total_kzt'); num(o, 'duration_seconds'); strings(o, 'limitations');
  const counts = object(o.counts, 'meta.counts');
  for (const key of ['nodes', 'edges', 'transactions', 'seeds', 'isolates', 'boundary', 'clusters']) num(counts, key, true);
  const period = object(o.period, 'period');
  for (const key of ['start', 'end']) requireValue(typeof period[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(period[key] as string), `period.${key}`);
  requireValue(Object.values(object(o.source_hashes, 'source_hashes')).every(v => typeof v === 'string'), 'source_hashes');
  const features = object(o.features, 'features'); for (const key of ['brief', 'removal', 'temporal', 'agent']) bool(features, key);
  return o as Meta;
}
export function parseTransfers(value: unknown): TransferPage {
  const o = object(value, 'transfers'); text(o, 'run_id');
  for (const key of ['total', 'offset', 'limit']) num(o, key, true);
  requireValue((o.limit as number) >= 1 && (o.limit as number) <= 200, 'limit');
  requireValue(['all', 'in', 'out'].includes(o.direction as string), 'direction');
  for (const key of ['sum_kzt', 'in_kzt', 'out_kzt']) money(o, key);
  const items = arr(o, 'items');
  requireValue(items.length <= (o.limit as number) && ((o.total as number) >= (o.offset as number) + items.length || items.length === 0), 'transfers.pagination');
  const refs = new Set<string>();
  for (const item of items) {
    const t = object(item, 'transfer'); gid(t.src, 'src'); gid(t.dst, 'dst'); money(t, 'sum_kzt'); num(t, 'source_row', true); text(t, 'source_ref');
    requireValue(typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date), 'date');
    requireValue(!refs.has(t.source_ref as string), 'duplicate source_ref'); refs.add(t.source_ref as string);
  }
  return o as TransferPage;
}
function clusterSummary(value: unknown) {
  const o = object(value, 'cluster');
  for (const key of ['cluster_id', 'n_nodes', 'n_seed']) num(o, key, true);
  requireValue((o.cluster_id as number) > 0, 'cluster_id'); money(o, 'sum_kzt_internal'); text(o, 'hypothesis');
  for (const id of arr(o, 'top_gids')) gid(id);
  return o;
}
export function parseClusters(value: unknown): ClusterPage {
  const o = object(value, 'clusters'); text(o, 'run_id'); arr(o, 'items').forEach(clusterSummary); return o as ClusterPage;
}
export function parseClusterDetail(value: unknown): ClusterDetail {
  const o = clusterSummary(value); text(o, 'run_id'); num(o, 'boundary_count', true); money(o, 'cross_in_kzt'); money(o, 'cross_out_kzt');
  const counts = object(o.role_counts, 'role_counts'); for (const key of roles) num(counts, key, true);
  return o as ClusterDetail;
}
