import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiSession, LatestRequest, SnapshotChanged } from '../api';
import { askAgent, agentMarkdown, type AgentAnswer } from './client';
import { CommonRecipients } from './CommonRecipients';
import './agent.css';

const kinds = { observation: 'Наблюдение', hypothesis: 'Гипотеза', limitation: 'Ограничение', next_step: 'Следующий шаг' };
const prompts = ['Почему этот узел стоит проверить? Сравни основную и альтернативную гипотезы.', 'Покажи исходные переводы, подтверждающие вывод.', 'Каких данных не хватает и что запросить дальше?'];
type Props = { api: ApiSession; gid: string | null; enabled: boolean; runId: string; select: (gid: string) => void; fail: (error: unknown) => void };
export function AgentPanel({ api, gid, enabled, runId, select, fail }: Props) {
  const dialog = useRef<HTMLDialogElement>(null); const trigger = useRef<HTMLButtonElement>(null); const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(new LatestRequest()); const urls = useRef(new Set<string>());
  const [open, setOpen] = useState(false); const [question, setQuestion] = useState(''); const [withNode, setWithNode] = useState(true);
  const [pending, setPending] = useState(false); const [elapsed, setElapsed] = useState(0); const [error, setError] = useState('');
  const [result, setResult] = useState<AgentAnswer | null>(null); const [submitted, setSubmitted] = useState({ question: '', gid: null as string | null });
  const context = withNode ? gid : null;
  useEffect(() => {
    if (open) { dialog.current?.showModal(); input.current?.focus(); }
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    latest.current.cancel(); setPending(false); setResult(null); setError(''); setElapsed(0);
  }, [context, runId]);
  useEffect(() => {
    if (!pending) return;
    const started = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  useEffect(() => () => { latest.current.cancel(); for (const url of urls.current) URL.revokeObjectURL(url); }, []);
  function close() { setOpen(false); trigger.current?.focus(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!enabled || pending || !question.trim()) return;
    const request = latest.current.start(); const submittedQuestion = question.trim();
    setPending(true); setElapsed(0); setError(''); setResult(null); setSubmitted({ question: submittedQuestion, gid: context });
    try { const answer = await askAgent(api, submittedQuestion, context, request.signal); if (request.isCurrent()) setResult(answer); }
    catch (error) {
      if (!request.isCurrent()) return;
      if (error instanceof SnapshotChanged) { close(); fail(error); }
      else setError(error instanceof Error ? error.message : 'Не удалось получить ответ. Повторите запрос.');
    } finally { if (request.isCurrent()) setPending(false); }
  }
  function save() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([agentMarkdown(submitted.question, submitted.gid, result)], { type: 'text/markdown;charset=utf-8' }));
    urls.current.add(url); const link = document.createElement('a'); link.href = url; link.download = `neverlose-agent-${submitted.gid ?? 'overview'}.md`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 30_000);
  }
  return <>
    <button ref={trigger} className="agent-trigger" aria-label="Открыть AI-аналитика" title="AI-аналитик: вопросы по наблюдаемой сети" onClick={() => setOpen(true)}><span aria-hidden="true">AI</span><span className="agent-trigger-label">Аналитик{pending ? '…' : ''}</span></button>
    <dialog ref={dialog} className="agent-dialog" aria-labelledby="agent-title" onCancel={event => { event.preventDefault(); close(); }} onClose={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <><div className="agent-heading"><div><span className="eyebrow">Вопрос → факты → основания</span><h2 id="agent-title">AI-аналитик</h2></div><button type="button" onClick={close} aria-label="Закрыть AI-аналитика">Закрыть · Esc</button></div>
      <div className="agent-body">
        <p className="agent-intro">Разберите гипотезу, проверьте переводы и определите следующий запрос данных. Ответ опирается на текущую наблюдаемую сеть.</p>
        <details className="agent-scope"><summary>Какие вопросы поддерживаются</summary><p>Роль и альтернатива узла, исходные переводы, соседи, кластер, общие прямые получатели 2–5 указанных счетов и следующий запрос данных. Обзор ограничен пятью лидерами, соседи — 20 связями за вызов. Поиск маршрутов и произвольные вычисления пока не поддерживаются. Полноту ответа проверяет аналитик.</p></details>
        <CommonRecipients api={api} gid={gid} runId={runId} busy={pending} fail={fail} select={id => { close(); select(id); }} prepare={text => { setQuestion(text); setWithNode(false); input.current?.focus(); input.current?.scrollIntoView({ block: 'center' }); }} />
        {gid ? <label className="agent-context"><input type="checkbox" checked={withNode} disabled={pending} onChange={event => setWithNode(event.target.checked)} /><span>Учитывать выбранный узел <strong className="mono">{gid}</strong></span></label> : <p className="agent-context">Контекст: вся наблюдаемая сеть. Для разбора конкретного узла выберите его на графе или в очереди.</p>}
        {!enabled && <div className="agent-disabled" role="status"><strong>AI-аналитик не включён на этом сервере.</strong><p>Граф, объяснения и CSV доступны локально. Для AI нужен настроенный серверный ключ и интернет.</p><details><summary>Как включить</summary><p>Настройте OPENAI_API_KEY на сервере и запустите <code>python run.py --assistant</code>. Ключ не вводится в браузере.</p></details></div>}
        <form onSubmit={event => void submit(event)} className="agent-form">
          <label htmlFor="agent-question">Вопрос аналитику</label>
          <textarea id="agent-question" ref={input} value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} rows={3} disabled={pending} placeholder={context ? 'Почему этот узел приоритетный и какие переводы это подтверждают?' : 'Какие узлы проверить первыми и почему?'} />
          <div className="agent-prompts" aria-label="Примеры вопросов">{(context ? prompts : ['Какие узлы проверить первыми? Покажи основания и ограничения.', 'Какие данные стоит запросить для продолжения анализа?']).map((prompt, index) => <button type="button" key={prompt} disabled={pending} onClick={() => { setQuestion(prompt); input.current?.focus(); }}>{context ? ['Разобрать гипотезу', 'Проверить переводы', 'Следующий шаг'][index] : ['С чего начать', 'Чего не хватает'][index]}</button>)}</div>
          <div className="agent-submit"><span>{question.length} / 2000</span><button type="submit" disabled={!enabled || pending || !question.trim()}>Задать вопрос</button></div>
          <p className="agent-disclosure">По нажатию вопрос и выбранные факты передаются OpenAI. Открытие панели запрос не запускает.</p>
        </form>
        {pending && <div className="agent-pending" role="status" aria-live="polite"><strong>Аналитик обрабатывает вопрос…</strong><p>Прошло {elapsed} с. Результат и фактические инструменты появятся после ответа сервера.</p><p>Панель можно закрыть; уже отправленный запрос продолжит выполняться.</p></div>}
        {error && <div className="agent-error" role="alert"><strong>Ответ не получен</strong><p>{error}</p><p>Вопрос сохранён. Кнопка «Задать вопрос» повторит запрос.</p></div>}
        {result && <section className="agent-result" aria-label="Ответ AI-аналитика" aria-live="polite">
          <div className="agent-result-heading"><h3>{result.status === 'answered' ? 'Ответ с основаниями' : 'Данных недостаточно для полного ответа.'}</h3><button type="button" onClick={save}>Сохранить ответ</button></div>
          <p className="agent-asked">{submitted.question}</p>
          <ol className="agent-citations">{result.citations.map(c => {
            const match = c.url.match(/^\/api\/v1\/nodes\/(\d{1,19})(?:\/|\?|$)/);
            return <li key={c.id}><span className={`agent-kind agent-kind-${c.kind}`}>{kinds[c.kind]}</span><p>{c.text}</p><div className="agent-source"><a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Источник ${c.id}`}>Источник {c.id} ↗</a>{match && <button type="button" onClick={() => { close(); select(match[1]); }} aria-label={`Открыть узел ${match[1]}`}>Открыть узел</button>}</div>{c.source_refs.length > 0 && <p className="agent-refs mono">{c.source_refs.join(' · ')}</p>}</li>;
          })}</ol>
          <details className="agent-tools"><summary>Вызовы инструментов ({result.tool_trace.length})</summary><ol data-testid="agent-trace">{result.tool_trace.map((step, index) => <li key={index}><strong>{step.tool}</strong> · {step.status === 'ok' ? 'данные получены' : 'данные не получены'}<pre>{JSON.stringify(step.arguments, null, 2)}</pre><span>{step.statement_ids.join(', ')}</span></li>)}</ol></details>
          <div className="agent-limits"><h3>Границы ответа</h3><ul>{result.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></div>
          <p className="agent-meta">{result.model} · обращений: {result.usage.model_calls} · токены: {result.usage.input_tokens} вход / {result.usage.output_tokens} выход</p><p className="agent-meta mono">run_id: {result.run_id}</p>
        </section>}
      </div></>
    </dialog>
  </>;
}
