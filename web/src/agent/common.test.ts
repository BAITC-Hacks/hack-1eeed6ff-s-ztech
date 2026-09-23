import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiSession, SnapshotChanged } from '../api';
import { parseSelection, parseCommonResult, commonUrl, getCommon } from './common';
const a = '900000000000000001', b = '900000000000000002', c = '900000000000000003';
const response = () => ({ run_id: 'test-run', source_gids: [a,b], min_sources: 2, matched_recipients: 1, shown_recipients: 1, truncated: false, items: [{ gid: c, source_count: 2, sum_kzt: '90071992547409.95', n_tx: 3, sources: [{ gid: a, sum_kzt: '90071992547409.93', n_tx: 2, source_refs: ['tx:1','tx:2'] }, { gid: b, sum_kzt: '0.02', n_tx: 1, source_refs: ['tx:3'] }] }], limitations: ['Только прямые переводы.'] });
afterEach(() => vi.unstubAllGlobals());
describe('common recipients trust boundary', () => {
  it('keeps exact IDs and money beyond Number precision', () => {
    expect(parseSelection(`${b};\n${a}`)).toEqual([a,b]);
    expect(parseCommonResult(response(), [b,a]).items[0].sum_kzt).toBe('90071992547409.95');
    expect(new URL(commonUrl([b,a]), 'http://localhost').searchParams.getAll('gid')).toEqual([a,b]);
  });
  it.each(['', a, `${a},${a}`, `${a},1e18`, `${a},9223372036854775808`, '1,2,3,4,5,6'])('rejects invalid selection %s', value => expect(() => parseSelection(value)).toThrow());
  it('rejects changed selection, threshold, amount, count and duplicate source refs', () => {
    const mutations = [
      (v: ReturnType<typeof response>) => { v.source_gids[1] = c; },
      (v: ReturnType<typeof response>) => { v.min_sources = 1; },
      (v: ReturnType<typeof response>) => { v.items[0].sum_kzt = '90071992547409.94'; },
      (v: ReturnType<typeof response>) => { v.items[0].n_tx = 2; },
      (v: ReturnType<typeof response>) => { v.items[0].sources[0].source_refs[1] = 'tx:1'; },
      (v: ReturnType<typeof response>) => { v.shown_recipients = 2; },
      (v: ReturnType<typeof response>) => { v.truncated = true; },
    ];
    for (const mutate of mutations) { const v = response(); mutate(v); expect(() => parseCommonResult(v, [a,b])).toThrow(); }
  });
  it('accepts an honest empty result', () => {
    const v = { ...response(), matched_recipients: 0, shown_recipients: 0, items: [] };
    expect(parseCommonResult(v, [a,b]).items).toEqual([]);
  });
  it('uses GET and shared snapshot; rejects a late aborted result', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify(response()))); vi.stubGlobal('fetch', mock);
    const api = new ApiSession(); api.accept({ run_id: 'test-run' });
    await getCommon(api, [a,b], new AbortController().signal);
    expect(mock).toHaveBeenCalledWith(commonUrl([a,b]), expect.objectContaining({ cache: 'no-store' }));
    api.runId = 'changed'; await expect(getCommon(api, [a,b], new AbortController().signal)).rejects.toBeInstanceOf(SnapshotChanged);
    const abort = new AbortController(); vi.stubGlobal('fetch', async () => { abort.abort(); return new Response(JSON.stringify(response())); });
    await expect(getCommon(new ApiSession(), [a,b], abort.signal)).rejects.toThrow();
  });
});
