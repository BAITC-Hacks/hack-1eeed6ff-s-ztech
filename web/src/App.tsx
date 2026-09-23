import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, ApiSession, LatestRequest, SnapshotChanged } from './api';
import { emptyFilters, validGid, type Filters, type Gid, type NodeDetail, type NodePage } from './domain';
import { Queue } from './components/Queue';
import { NodePanel } from './components/NodePanel';
import { Failure, Loading } from './components/States';

type View = 'network' | 'queue' | 'detail';
type Remote<T> = { data: T | null; loading: boolean; error: Error | null };
const idle = { data: null, loading: false, error: null };
export function App() {
  const api = useRef(new ApiSession());
  const queueRequest = useRef(new LatestRequest());
  const nodeRequest = useRef(new LatestRequest());
  const searchRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Remote<NodePage>>(idle);
  const [detail, setDetail] = useState<Remote<NodeDetail>>(idle);
  const [selected, setSelected] = useState<Gid | null>(null);
  const [filters, setFiltersState] = useState<Filters>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [notice, setNotice] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<Error | null>(null);
  const [view, setView] = useState<View>('network');
  const fail = useCallback((error: unknown) => {
    const err = error instanceof Error ? error : new Error('Неизвестная ошибка API.');
    if (err instanceof SnapshotChanged) {
      queueRequest.current.cancel(); nodeRequest.current.cancel(); setQueue(idle); setDetail(idle); setSelected(null); setRunId(null); setFatal(err);
    }
    return err;
  }, []);
  function reset() {
    queueRequest.current.cancel(); nodeRequest.current.cancel(); api.current = new ApiSession();
    setQueue(idle); setDetail(idle); setSelected(null); setRunId(null); setFatal(null); setOffset(0); setRefresh(v => v + 1);
  }
  function setFilters(next: Filters) { setOffset(0); setFiltersState(next); }
  useEffect(() => {
    if (fatal) return;
    const request = queueRequest.current.start();
    setQueue({ data: null, error: null, loading: true });
    api.current.nodes(filters, offset, request.signal).then(data => {
      if (request.isCurrent()) { setRunId(data.run_id); setQueue({ data, loading: false, error: null }); }
    }).catch(error => { if (request.isCurrent()) setQueue({ data: null, loading: false, error: fail(error) }); });
    return () => queueRequest.current.cancel();
  }, [filters, offset, refresh, fatal, fail]);
  useEffect(() => () => nodeRequest.current.cancel(), []);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setView('network'); searchRef.current?.focus(); }
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  async function select(gid: Gid) {
    if (fatal) return;
    const request = nodeRequest.current.start();
    setSelected(gid); setDetail({ data: null, loading: true, error: null }); setView('detail'); setSearchError('');
    try {
      const data = await api.current.node(gid, request.signal);
      if (request.isCurrent()) { setRunId(data.run_id); setDetail({ data, loading: false, error: null }); }
    } catch (error) {
      if (request.isCurrent()) {
        const err = error instanceof ApiError && error.status === 404 ? new ApiError('Такого gid нет в этой выгрузке. Проверьте полный идентификатор.', 404, 'NODE_NOT_FOUND') : fail(error);
        setDetail({ data: null, loading: false, error: err });
      }
    }
  }
  function search(event: FormEvent) {
    event.preventDefault(); const gid = query.trim();
    if (!validGid(gid)) { setSearchError('Введите от 1 до 19 цифр в диапазоне int64. gid не преобразуется в число.'); return; }
    setQuery(gid);
    if (filters.role || filters.boundary || filters.is_seed || filters.cluster_id) {
      setFilters(emptyFilters); setNotice('Фильтры сброшены: поиск выполняется по полному набору.');
    }
    void select(gid);
  }
  return <div className="app">
    <header className="header"><div className="brand"><strong>Neverlose<span className="brand-dot"> / </span></strong><span>Граф денег</span></div>
      <form className="search" onSubmit={search}><label className="sr-only" htmlFor="gid-search">Поиск по полному gid</label>
        <input id="gid-search" ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Полный gid" inputMode="numeric" autoComplete="off" aria-invalid={!!searchError} aria-describedby={searchError ? 'search-error' : undefined} />
        <button type="submit" disabled={!!fatal}>Найти</button></form>
      <button className="quiet" onClick={reset}>Обновить данные</button>
    </header>
    <div className="status-strip"><div><span className="eyebrow">Наблюдаемая сеть</span><p>{runId ? 'Данные локального API' : 'Ожидание локального API'}</p></div>
      <div className="run"><span className="eyebrow">Расчёт · run_id</span><p className="mono">{runId ?? 'Не загружен'}</p></div>
      <p className="caption">Роли — гипотезы.<br />Связь не доказывает происхождение денег.</p></div>
    {runId?.startsWith('example-synthetic-contract-only') && <div className="test-banner" role="status">Тестовый контракт · синтетические данные для проверки UI, не результат анализа</div>}
    {searchError && <div id="search-error" className="notice error" role="alert">{searchError}</div>}
    {notice && <div className="notice" role="status">{notice}<button className="quiet" onClick={() => setNotice('')} aria-label="Закрыть уведомление">×</button></div>}
    {fatal ? <Failure error={fatal} retry={reset} /> : <>
      <nav className="mobile-tabs" aria-label="Панели рабочего места">{(['network', 'queue', 'detail'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{({ network: 'Сеть', queue: 'Приоритеты', detail: 'Карточка' })[tab]}</button>)}</nav>
      <main className={`workspace view-${view}`}>
        <aside className="panel queue-panel" aria-label="Приоритеты"><div className="panel-heading"><h1>Приоритеты</h1><span className="caption">Правила v1</span></div><div className="panel-body">
          {queue.loading && <Loading />}{queue.error && <Failure error={queue.error} retry={() => setRefresh(v => v + 1)} />}
          {queue.data && <Queue page={queue.data} filters={filters} selected={selected} setFilters={setFilters} select={id => void select(id)} offset={offset} setOffset={setOffset} />}
        </div></aside>
        <section className="panel network-panel" aria-label="Направленный граф"><div className="panel-heading"><h2>Наблюдаемая сеть</h2></div>
          <div className="graph-placeholder"><span className="empty-symbol" aria-hidden="true">↗</span><h3>Окружение узла</h3><p>Выберите узел в очереди<br />или найдите его по полному gid.</p><p className="caption">Граф подключается на этапе B2.</p></div>
          <div className="network-note">Исходные переводы и метаданные будут доступны после согласования ответов API с backend.</div>
        </section>
        <aside className="panel detail-panel" aria-label="Карточка узла"><div className="panel-heading"><h2>Карточка узла</h2><button className="drawer-close quiet" onClick={() => { setView('network'); searchRef.current?.focus(); }}>Закрыть · Esc</button></div><div className="panel-body">
          {detail.loading && <Loading text={`Загрузка узла ${selected}…`} />}{detail.error && <Failure error={detail.error} retry={() => selected && void select(selected)} />}
          {detail.data && <NodePanel node={detail.data} />}{!detail.loading && !detail.error && !detail.data && <div className="state"><h3>Почему этот узел?</h3><p>Выберите узел, чтобы проверить роль, наблюдаемые потоки и ограничения.</p></div>}
        </div></aside>
      </main>
    </>}
    <footer>Локальный анализ · только наблюдаемая выгрузка · без выводов о виновности</footer>
  </div>;
}
