import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiSession, SnapshotChanged } from '../api';
import { parseAgentAnswer, askAgent, agentMarkdown } from './client';

const gid = '900000000000000002';
const response = () => ({
  run_id: 'test-run', model: 'test-model', status: 'answered', answer: 'Проверенное основание.',
  citations: [{ id: 's1', kind: 'observation', text: `Узел ${gid}.`, url: `/api/v1/nodes/${gid}`, source_refs: ['tx:7'] }, { id: 's2', kind: 'limitation', text: 'Только наблюдаемая сеть.', url: '/api/v1/meta', source_refs: [] }],
  tool_trace: [{ step: 1, tool: 'get_node', arguments: { gid }, status: 'ok', statement_ids: ['s1', 's2'] }],
  usage: { model_calls: 2, input_tokens: 120, output_tokens: 40 }, limitations: ['Роли — гипотезы.'],
});
afterEach(() => vi.unstubAllGlobals());
describe('agent response trust boundary', () => {
  it('keeps exact gids and real trace, including insufficient-data status', () => {
    const value = response(); value.status = 'insufficient_data';
    const actual = parseAgentAnswer(value);
    expect(actual.tool_trace[0].arguments.gid).toBe(gid);
    expect(actual.status).toBe('insufficient_data');
  });
  it.each(['https://evil.example/api/v1/meta', '//evil.example/api/v1/meta', 'javascript:alert(1)', '/api/v1/meta/../../evil', '/api/v1/meta#x'])('rejects unsafe source URL %s', url => {
    const value = response(); value.citations[0].url = url;
    expect(() => parseAgentAnswer(value)).toThrow();
  });
  it('rejects a fabricated citation outside successful tool results', () => {
    const value = response(); value.citations[0].id = 'invented';
    expect(() => parseAgentAnswer(value)).toThrow();
    const failed = response(); failed.tool_trace[0].status = 'error';
    expect(() => parseAgentAnswer(failed)).toThrow();
  });
  it('rejects malformed or duplicated evidence and invalid usage', () => {
    const value = response(); value.citations.push(value.citations[0]);
    expect(() => parseAgentAnswer(value)).toThrow();
    const invalid = response(); invalid.usage.model_calls = NaN;
    expect(() => parseAgentAnswer(invalid)).toThrow();
    expect(() => parseAgentAnswer({ answer: 'not enough' })).toThrow();
  });
  it('exports a report with question, run, sources, trace and no invented answer', () => {
    const markdown = agentMarkdown('Почему этот узел?', gid, parseAgentAnswer(response()));
    expect(markdown.split('\n').length).toBeGreaterThan(10); expect(markdown).toContain('\n\n## Источники\n\n');
    expect(markdown).toContain('test-run'); expect(markdown).toContain('test-model');
    expect(markdown).toContain('tx:7'); expect(markdown).toContain('get_node');
    expect(markdown).toContain('Проверенное основание.'); expect(markdown).toContain(gid);
  });
});
describe('agent request', () => {
  it('posts an exact string gid and checks the shared snapshot', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(response()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock); const api = new ApiSession(); api.accept({ run_id: 'test-run' });
    const result = await askAgent(api, 'Что видно?', gid, new AbortController().signal);
    expect(result.run_id).toBe('test-run');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/agent/query');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ question: 'Что видно?', gid });
    api.runId = 'new-run';
    await expect(askAgent(api, 'Что видно?', gid, new AbortController().signal)).rejects.toBeInstanceOf(SnapshotChanged);
  });
  it('does not submit invalid input or accept an aborted result', async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify(response()))); vi.stubGlobal('fetch', fn);
    await expect(askAgent(new ApiSession(), ' ', gid, new AbortController().signal)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    await expect(askAgent(new ApiSession(), 'Вопрос', gid, controller.signal)).rejects.toThrow();
  });
  it('preserves disabled/busy/provider errors and rejects broken JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'AGENT_BUSY', message: 'Аналитик занят' } }), { status: 429 }));
    await expect(askAgent(new ApiSession(), 'Вопрос', gid, new AbortController().signal)).rejects.toMatchObject({ code: 'AGENT_BUSY', status: 429 });
    vi.stubGlobal('fetch', async () => new Response('<html>failure</html>', { status: 502 }));
    await expect(askAgent(new ApiSession(), 'Вопрос', gid, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_AGENT_RESPONSE' });
  });
});
