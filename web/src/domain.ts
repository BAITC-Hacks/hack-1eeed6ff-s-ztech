// Mirrors docs/hackalem/03_ARCHITECTURE_CONTRACTS.md v1. No client analytics.
export type Gid = string;
export type Kzt = string;
export const roles = ['consolidator', 'transit', 'distributor', 'terminal', 'coordinator', 'peripheral'] as const;
export type Role = typeof roles[number];
export const roleLabels: Record<Role, string> = {
  consolidator: 'Консолидация', transit: 'Транзит', distributor: 'Распределение',
  terminal: 'Конец наблюдаемого пути', coordinator: 'Координация · гипотеза', peripheral: 'Периферия',
};
export type Flag = 'boundary' | 'isolated' | 'seed_inflow_incomplete' | 'out_exceeds_in' | 'low_observation';
export type RuleCheck = { key: string; actual: number | null; operator: string; threshold: number | null; passed: boolean; text: string };
export type Contribution = { key: string; label: string; raw: number; normalized: number; weight: number; contribution: number };
export type Candidate = { role: Role; eligible: boolean; raw_score: number; capped_score: number; checks: RuleCheck[] };
export type NodeSummary = {
  gid: Gid; role: Role; role_score: number; cluster_id: number; priority_score: number;
  evidence: string; depth: number; is_seed: boolean; flags: Flag[];
};
export type NodeDetail = NodeSummary & {
  run_id: string; in_degree: number; out_degree: number; in_kzt: Kzt; out_kzt: Kzt;
  in_tx: number; out_tx: number; observed_ratio: number | null; seed_reach_count: number;
  pagerank: number; betweenness: number; participation: number; role_rule_id: string;
  candidates: Candidate[]; priority_contributions: Contribution[];
  limitations: string[]; next_data_requests: string[];
  raw_score: number; score_caps: { key: string; cap: number; reason: string }[];
  supporting_transfers: { total: number; source_refs: string[]; url: string };
  alternative: Candidate | null;
};
export type NodePage = { run_id: string; items: NodeSummary[]; total: number; offset: number; limit: number };
export type Transfer = { source_ref: string; source_row: number; src: Gid; dst: Gid; date: string; sum_kzt: Kzt };
export type ClusterSummary = { cluster_id: number; n_nodes: number; n_seed: number; sum_kzt_internal: Kzt; top_gids: Gid[]; hypothesis: string };
export type ClusterDetail = ClusterSummary & { run_id: string; role_counts: Record<Role, number>; boundary_count: number; cross_in_kzt: Kzt; cross_out_kzt: Kzt };
export type GraphNode = { id: string; kind: 'node' | 'cluster'; gid: Gid | null; cluster_id: number; label: string; role: Role | null; priority_score: number | null; boundary: boolean; is_seed: boolean; n_nodes: number };
export type GraphEdge = { id: string; source: string; target: string; sum_kzt: Kzt; n_tx: number };
export type GraphResponse = {
  run_id: string; scope: { mode: 'ego' | 'overview' | 'cluster'; gid?: Gid; cluster_id?: number; hops?: number };
  nodes: GraphNode[]; edges: GraphEdge[];
  counts: { matched_nodes: number; shown_nodes: number; matched_edges: number; shown_edges: number }; truncated: boolean;
};
export type Filters = { role: Role | ''; cluster_id: string; boundary: boolean; is_seed: boolean };
export const emptyFilters: Filters = { role: '', cluster_id: '', boundary: false, is_seed: false };

export function validGid(value: unknown): value is Gid {
  return typeof value === 'string' && /^[0-9]{1,19}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
export function formatKzt(value: Kzt): string {
  const [whole, fraction] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')},${fraction} ₸`;
}
export function score(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
