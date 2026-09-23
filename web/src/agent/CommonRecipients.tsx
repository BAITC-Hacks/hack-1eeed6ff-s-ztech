import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiSession, LatestRequest, SnapshotChanged } from '../api';
import { commonUrl, getCommon, parseSelection, type CommonResult } from './common';

type Props = { api: ApiSession; gid: string | null; runId: string; busy: boolean; select: (gid: string) => void; fail: (error: unknown) => void; prepare: (question: string) => void };
export function CommonRecipients({ api, gid, runId, busy, select, fail, prepare }: Props) {
  const [value, setValue] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<CommonResult | null>(null); const latest = useRef(new LatestRequest());
  useEffect(() => { latest.current.cancel(); setResult(null); setPending(false); setError(''); }, [runId]);
  useEffect(() => () => latest.current.cancel(), []);
  function change(next: string) { latest.current.cancel(); setValue(next); setResult(null); setPending(false); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); const request = latest.current.start(); setResult(null); setError('');
    try {
      const selected = parseSelection(value); setPending(true);
      const report = await getCommon(api, selected, request.signal); if (request.isCurrent()) setResult(report);
    } catch (error) {
      if (!request.isCurrent()) return;
      if (error instanceof SnapshotChanged) fail(error); else setError(error instanceof Error ? error.message : 'Не удалось выполнить расчёт.');
    } finally { if (request.isCurrent()) setPending(false); }
  }
  return <details className="agent-common">
    <summary>Общие получатели · без API-ключа</summary>
    <p>Куда сходятся переводы выбранной группы? Поиск проверяет все исходные операции и показывает получателей от каждого из указанных счетов.</p>
    <form onSubmit={event => void submit(event)} className="agent-form">
      <label htmlFor="common-gids">Отправители: 2–5 разных gid</label>
      <textarea id="common-gids" value={value} onChange={event => change(event.target.value)} rows={3} maxLength={120} placeholder="Полные gid через пробел или с новой строки" />
      <div className="agent-prompts">{gid && <button type="button" disabled={pending} onClick={() => { const ids = value.trim().split(/[\s,;]+/).filter(Boolean); if (!ids.includes(gid)) change([...ids, gid].join('\n')); }}>Добавить выбранный узел</button>}<button type="submit" disabled={pending || !value.trim()}>{pending ? 'Считаем…' : 'Найти общих получателей'}</button></div>
    </form>
    {error && <p className="agent-error" role="alert">{error}</p>}
    {result && <section className="common-result" aria-label="Общие получатели" aria-live="polite">
      <p><strong>Найдено: {result.matched_recipients}</strong> · показано {result.shown_recipients}. У каждого — переводы от всех {result.source_gids.length} выбранных отправителей.</p>
      {result.matched_recipients === 0 && <p>Общих прямых получателей в наблюдаемой выгрузке нет. Это не исключает связей через другие узлы.</p>}
      {result.truncated && <p>Показаны первые 10 по числу отправителей, затем по сумме переводов.</p>}
      <ol className="common-items">{result.items.map(item => <li key={item.gid}>
        <button className="mono" type="button" onClick={() => select(item.gid)} aria-label={`Открыть общего получателя ${item.gid}`}>{item.gid} ↗</button>
        <p><strong>{item.sum_kzt} KZT</strong> · операций: {item.n_tx} · отправителей: {item.source_count}/{result.source_gids.length}</p>
        <details><summary>Вклад каждого отправителя и исходные строки</summary>{item.sources.map(source => <div key={source.gid} className="common-source"><span className="mono">{source.gid}</span><p>{source.sum_kzt} KZT · операций: {source.n_tx}</p><details><summary>Строки ({source.source_refs.length})</summary><p className="mono agent-refs">{source.source_refs.join(' · ')}</p></details></div>)}</details>
      </li>)}</ol>
      <p><a href={commonUrl(result.source_gids)} target="_blank" rel="noopener noreferrer">Открыть расчёт и все источники ↗</a></p>
      <button type="button" disabled={busy} onClick={() => prepare(`Найди общих прямых получателей от ВСЕХ этих ${result.source_gids.length} счетов: ${result.source_gids.join(', ')}. Укажи суммы только от выбранной группы, число операций и ограничения. Что проверить дальше?`)}>Подготовить вопрос AI</button>
      <p className="agent-disclosure">Кнопка заполняет вопрос. Отправка в OpenAI — только после «Задать вопрос».</p>
      <details className="agent-limits"><summary>Как понимать результат</summary><ul>{result.limitations.map(text => <li key={text}>{text}</li>)}</ul></details>
    </section>}
  </details>;
}
