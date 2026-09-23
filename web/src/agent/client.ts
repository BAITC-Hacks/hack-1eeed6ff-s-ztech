import { ApiError, type ApiSession } from '../api';
import { validGid } from '../domain';

export type Citation = { id: string; kind: 'observation' | 'hypothesis' | 'limitation' | 'next_step'; text: string; url: string; source_refs: string[] };
export type ToolStep = { step: number; tool: string; arguments: Record<string, unknown>; status: 'ok' | 'error'; statement_ids: string[] };
export type AgentAnswer = { run_id: string; model: string; status: 'answered' | 'insufficient_data'; answer: string; citations: Citation[]; tool_trace: ToolStep[]; usage: { model_calls: number; input_tokens: number; output_tokens: number }; limitations: string[] };
const bad = () => new ApiError('Сервер не подтвердил ответ и его источники. Ответ не показан; повторите запрос.', 502, 'INVALID_AGENT_RESPONSE');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw bad(); return value; }
function strings(value: unknown): string[] { if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw bad(); return value; }
function integer(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw bad(); return value; }
const tools = ['get_overview', 'get_node', 'get_neighbors', 'get_transfers', 'get_cluster', 'compare_hypotheses', 'prepare_brief', 'find_common_recipients'];
export function parseAgentAnswer(value: unknown): AgentAnswer {
  const v = object(value); text(v.run_id); text(v.model); text(v.answer); strings(v.limitations);
  if (v.status !== 'answered' && v.status !== 'insufficient_data') throw bad();
  if (!Array.isArray(v.citations) || !v.citations.length || !Array.isArray(v.tool_trace)) throw bad();
  const returned = new Set<string>();
  for (const raw of v.tool_trace) {
    const step = object(raw); if (integer(step.step) < 1 || !tools.includes(text(step.tool))) throw bad();
    object(step.arguments); strings(step.statement_ids);
    if (step.status !== 'ok' && step.status !== 'error') throw bad();
    if (step.status === 'ok') for (const id of step.statement_ids as string[]) returned.add(id);
  }
  const ids = new Set<string>();
  for (const raw of v.citations) {
    const c = object(raw); const id = text(c.id); text(c.text); strings(c.source_refs);
    if (ids.has(id) || !returned.has(id)) throw bad(); ids.add(id);
    if (!['observation', 'hypothesis', 'limitation', 'next_step'].includes(text(c.kind))) throw bad();
    const url = text(c.url);
    // Same-origin read-only API paths only, without fragments or traversal.
    if (!/^\/api\/v1\/(?:meta|nodes\/\d{1,19}(?:\/transfers)?|clusters\/\d+|analysis\/common-recipients)(?:\?[a-zA-Z0-9_=&%-]+)?$/.test(url)) throw bad();
    if (url.includes('%')) throw bad();
  }
  if (!(v.citations as Citation[]).some(c => c.kind === 'limitation')) throw bad();
  const usage = object(v.usage); integer(usage.model_calls); integer(usage.input_tokens); integer(usage.output_tokens);
  return v as unknown as AgentAnswer;
}
export async function askAgent(api: ApiSession, question: string, gid: string | null, signal: AbortSignal): Promise<AgentAnswer> {
  signal.throwIfAborted();
  if (!question.trim() || question.length > 2000 || (gid !== null && !validGid(gid))) throw new ApiError('Введите вопрос до 2000 символов и корректный gid.', 422, 'INVALID_PARAMETER');
  let response: Response;
  try { response = await fetch('/api/v1/agent/query', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ question: question.trim(), gid }), signal, cache: 'no-store' }); }
  catch (error) { if (signal.aborted) throw error; throw new ApiError('Локальный сервер недоступен. Проверьте подключение и повторите запрос.'); }
  let value: unknown;
  try { value = await response.json(); } catch { throw bad(); }
  signal.throwIfAborted();
  if (!response.ok) {
    const body = object(value); const error = object(body.error);
    throw new ApiError(typeof error.message === 'string' ? error.message : 'Не удалось получить ответ аналитика.', response.status, typeof error.code === 'string' ? error.code : 'AGENT_ERROR');
  }
  return api.accept(parseAgentAnswer(value));
}
export function agentMarkdown(question: string, gid: string | null, result: AgentAnswer): string {
  return `# Ответ AI-аналитика Neverlose\n\nВопрос: ${question}\n\nКонтекст: ${gid ?? 'наблюдаемая сеть'}\nRun: ${result.run_id}\nМодель: ${result.model}\nСтатус: ${result.status}\n\n${result.answer}\n\n## Источники\n\n${result.citations.map(c => `- [${c.id}] ${c.text}\n  ${c.url}${c.source_refs.length ? `\n  ${c.source_refs.join(', ')}` : ''}`).join('\n')}\n\n## Фактические вызовы инструментов\n\n${result.tool_trace.map(t => `- ${t.step}. ${t.tool}: ${JSON.stringify(t.arguments)} — ${t.status}; ${t.statement_ids.join(', ')}`).join('\n')}\n\n## Ограничения\n\n${result.limitations.map(t => `- ${t}`).join('\n')}\n`;
}
