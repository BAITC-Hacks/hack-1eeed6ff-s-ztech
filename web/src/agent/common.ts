import { ApiError, type ApiSession, requestJson } from '../api';
import { validGid } from '../domain';

export type SourceFlow = { gid: string; sum_kzt: string; n_tx: number; source_refs: string[] };
export type CommonRecipient = { gid: string; source_count: number; sum_kzt: string; n_tx: number; sources: SourceFlow[] };
export type CommonResult = { run_id: string; source_gids: string[]; min_sources: number; matched_recipients: number; shown_recipients: number; truncated: boolean; items: CommonRecipient[]; limitations: string[] };
const bad = () => new ApiError('API не подтвердил состав группы или суммы. Результат не показан.', 502, 'INVALID_COMMON_RESPONSE');
const sortGids = (gids: string[]) => [...gids].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
export function parseSelection(value: string): string[] {
  const gids = value.trim().split(/[\s,;]+/).filter(Boolean);
  if (gids.length < 2 || gids.length > 5 || new Set(gids).size !== gids.length || gids.some(gid => !validGid(gid))) throw new ApiError('Введите от 2 до 5 разных полных gid через пробел или с новой строки.', 422, 'INVALID_SELECTION');
  return sortGids(gids);
}
export function commonUrl(gids: string[]): string {
  const query = new URLSearchParams(); for (const gid of sortGids(gids)) query.append('gid', gid);
  query.set('min_sources', String(gids.length)); query.set('limit', '10');
  return `/api/v1/analysis/common-recipients?${query}`;
}
function obj(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(); return v as Record<string, unknown>; }
function count(v: unknown): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw bad(); return v; }
function money(v: unknown): bigint { if (typeof v !== 'string' || !/^(0|[1-9]\d*)\.\d{2}$/.test(v)) throw bad(); return BigInt(v.replace('.', '')); }
function gid(v: unknown): string { if (typeof v !== 'string' || !validGid(v)) throw bad(); return v; }
export function parseCommonResult(value: unknown, selected: string[]): CommonResult {
  const v = obj(value);
  if (typeof v.run_id !== 'string' || !v.run_id || !Array.isArray(v.source_gids) || JSON.stringify(v.source_gids) !== JSON.stringify(sortGids(selected)) || v.min_sources !== selected.length) throw bad();
  const matched = count(v.matched_recipients), shown = count(v.shown_recipients);
  if (!Array.isArray(v.items) || shown !== v.items.length || shown !== Math.min(10, matched) || v.truncated !== (matched > shown)) throw bad();
  if (!Array.isArray(v.limitations) || !v.limitations.length || v.limitations.some(t => typeof t !== 'string' || !t)) throw bad();
  const seen = new Set<string>();
  for (const raw of v.items) {
    const row = obj(raw), recipient = gid(row.gid); if (seen.has(recipient)) throw bad(); seen.add(recipient);
    if (!Array.isArray(row.sources) || row.source_count !== selected.length || row.sources.length !== selected.length) throw bad();
    const sources = new Set<string>(); let total = 0n, operations = 0;
    for (const rawSource of row.sources) {
      const source = obj(rawSource), id = gid(source.gid), n = count(source.n_tx);
      if (!selected.includes(id) || id === recipient || sources.has(id) || n < 1 || !Array.isArray(source.source_refs) || source.source_refs.length !== n || new Set(source.source_refs).size !== n || source.source_refs.some(ref => typeof ref !== 'string' || !ref.startsWith('tx:'))) throw bad();
      sources.add(id); total += money(source.sum_kzt); operations += n;
    }
    if (money(row.sum_kzt) !== total || count(row.n_tx) !== operations) throw bad();
  }
  return v as unknown as CommonResult;
}
export async function getCommon(api: ApiSession, selected: string[], signal: AbortSignal): Promise<CommonResult> {
  const value = await requestJson(commonUrl(selected), signal); signal.throwIfAborted();
  return api.accept(parseCommonResult(value, selected));
}
