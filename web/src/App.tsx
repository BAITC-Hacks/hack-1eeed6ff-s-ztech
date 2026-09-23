import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, ApiSession, LatestRequest, SnapshotChanged } from './api';
import { emptyFilters, formatKzt, validGid, type ClusterDetail, type ClusterSummary, type Direction, type Filters, type Gid, type GraphResponse, type Meta, type NodeDetail, type NodePage, type TransferPage } from './domain';
import { Queue } from './components/Queue';
import { NodePanel } from './components/NodePanel';
import { Failure, Loading } from './components/States';
import { Network } from './components/Network';
import { ClusterPanel } from './components/ClusterPanel';
import { Transfers } from './components/Transfers';
import { Exports } from './components/Exports';
import { Icon } from './components/Icon';

type View = 'network' | 'queue' | 'detail';
type Remote<T> = { data: T | null; loading: boolean; error: Error | null };
const idle = { data: null, loading: false, error: null };
export function App() {
  const api = useRef(new ApiSession());
  const queueRequest = useRef(new LatestRequest());
  const nodeRequest = useRef(new LatestRequest());
  const graphRequest = useRef(new LatestRequest());
  const metaRequest = useRef(new LatestRequest());
  const transfersRequest = useRef(new LatestRequest());
  const clusterRequest = useRef(new LatestRequest());
  const transfersRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Remote<NodePage>>(idle);
  const [detail, setDetail] = useState<Remote<NodeDetail>>(idle);
  const [graph, setGraph] = useState<Remote<GraphResponse>>(idle);
  const [meta, setMeta] = useState<Remote<Meta>>(idle);
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [cluster, setCluster] = useState<Remote<ClusterDetail>>(idle);
  const [transfers, setTransfers] = useState<Remote<TransferPage>>(idle);
  const [direction, setDirection] = useState<Direction>('all');
  const [transferOffset, setTransferOffset] = useState(0);
  const [transferRefresh, setTransferRefresh] = useState(0);
  const [showLimits, setShowLimits] = useState(false);
  const [centerView, setCenterView] = useState<'both' | 'graph' | 'transfers'>('graph');
  const [clusterId, setClusterId] = useState<number | null>(null);
  const [hops, setHops] = useState(1);
  const [graphRefresh, setGraphRefresh] = useState(0);
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
      queueRequest.current.cancel(); nodeRequest.current.cancel(); graphRequest.current.cancel(); setQueue(idle); setDetail(idle); setGraph(idle); setSelected(null); setRunId(null); setFatal(err);
      metaRequest.current.cancel(); transfersRequest.current.cancel(); clusterRequest.current.cancel(); setMeta(idle); setClusters([]); setTransfers(idle); setCluster(idle);
    }
    return err;
  }, []);
  function reset() {
    setCenterView('graph');
    queueRequest.current.cancel(); nodeRequest.current.cancel(); graphRequest.current.cancel(); api.current = new ApiSession();
    metaRequest.current.cancel(); transfersRequest.current.cancel(); clusterRequest.current.cancel(); setMeta(idle); setClusters([]); setTransfers(idle); setCluster(idle);
    setQueue(idle); setDetail(idle); setGraph(idle); setSelected(null); setClusterId(null); setRunId(null); setFatal(null); setOffset(0); setRefresh(v => v + 1);
  }
  function setFilters(next: Filters) { setOffset(0); setFiltersState(next); }
  useEffect(() => {
    if (fatal) return;
    const request = metaRequest.current.start(); setMeta({ data: null, loading: true, error: null });
    Promise.all([api.current.meta(request.signal), api.current.clusters(request.signal)]).then(([data, list]) => {
      if (request.isCurrent()) { setRunId(data.run_id); setMeta({ data, loading: false, error: null }); setClusters(list.items); }
    }).catch(error => { if (request.isCurrent()) setMeta({ data: null, loading: false, error: fail(error) }); });
    return () => metaRequest.current.cancel();
  }, [refresh, fatal, fail]);
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
    if (fatal) return;
    const request = graphRequest.current.start(); setGraph({ data: null, loading: true, error: null });
    api.current.graph(selected, clusterId, hops, request.signal).then(data => {
      if (request.isCurrent()) { setRunId(data.run_id); setGraph({ data, loading: false, error: null }); }
    }).catch(error => { if (request.isCurrent()) setGraph({ data: null, loading: false, error: fail(error) }); });
    return () => graphRequest.current.cancel();
  }, [selected, clusterId, hops, graphRefresh, refresh, fatal, fail]);
  useEffect(() => {
    if (fatal || !selected || !detail.data || detail.data.gid !== selected) { setTransfers(idle); return; }
    const request = transfersRequest.current.start(); setTransfers({ data: null, loading: true, error: null });
    api.current.transfers(selected, direction, transferOffset, request.signal).then(data => {
      if (request.isCurrent()) setTransfers({ data, loading: false, error: null });
    }).catch(error => { if (request.isCurrent()) setTransfers({ data: null, loading: false, error: fail(error) }); });
    return () => transfersRequest.current.cancel();
  }, [selected, detail.data, direction, transferOffset, transferRefresh, fatal, fail]);
  useEffect(() => {
    if (fatal || selected || clusterId === null) { setCluster(idle); return; }
    const request = clusterRequest.current.start(); setCluster({ data: null, loading: true, error: null });
    api.current.cluster(clusterId, request.signal).then(data => {
      if (request.isCurrent()) setCluster({ data, loading: false, error: null });
    }).catch(error => { if (request.isCurrent()) setCluster({ data: null, loading: false, error: fail(error) }); });
    return () => clusterRequest.current.cancel();
  }, [selected, clusterId, graphRefresh, fatal, fail]);
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
    setSelected(gid); setClusterId(null); setGraph(idle); setGraphRefresh(v => v + 1); setDetail({ data: null, loading: true, error: null }); setView('detail'); setSearchError('');
    setCenterView('graph');
    transfersRequest.current.cancel(); clusterRequest.current.cancel(); setTransfers(idle); setCluster(idle); setDirection('all'); setTransferOffset(0);
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
  function openCluster(id: number | null) {
    setCenterView('graph');
    nodeRequest.current.cancel(); setSelected(null); setDetail(idle); setGraph(idle); setClusterId(id); setGraphRefresh(v => v + 1);
    setFilters({ ...emptyFilters, cluster_id: id === null ? '' : String(id) }); setView('network');
  }
  function showTransfers(value: Direction) {
    setDirection(value); setTransferOffset(0); setView('network'); setCenterView('transfers');
    requestAnimationFrame(() => transfersRef.current?.focus());
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
    <header className="header"><div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="M6 21V7l16 14V7" stroke="currentColor" strokeWidth="2.5" /><path d="M17 7h5v5" stroke="currentColor" strokeWidth="2.5" /></svg></span><div><strong>Neverlose</strong><span>Граф денег</span></div></div>
      <form className="search" onSubmit={search}><label className="sr-only" htmlFor="gid-search">Поиск по полному gid</label>
        <Icon name="search" /><input id="gid-search" ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти по полному gid" inputMode="numeric" autoComplete="off" aria-invalid={!!searchError} aria-describedby={searchError ? 'search-error' : undefined} />
        <button type="submit" disabled={!!fatal}>Найти</button></form>
      {meta.data && !fatal && <Exports key={meta.data.run_id} api={api.current} fail={fail} />}
      <button className="quiet icon-button" onClick={reset} aria-label="Обновить" title="Обновить данные"><Icon name="refresh" /></button>
    </header>
    <div className="status-strip">{meta.data ? <><div><span className="eyebrow">Узлы</span><p className="kpi">{meta.data.counts.nodes.toLocaleString('ru-RU')}</p></div><div><span className="eyebrow">Связи</span><p className="kpi">{meta.data.counts.edges.toLocaleString('ru-RU')}</p></div><div><span className="eyebrow">Переводы</span><p className="kpi">{meta.data.counts.transactions.toLocaleString('ru-RU')}</p></div><div><span className="eyebrow">Наблюдаемый оборот</span><p className="kpi turnover">{formatKzt(meta.data.total_kzt)}</p></div><div className="period"><span className="eyebrow">Период выгрузки</span><p>{meta.data.period.start} — {meta.data.period.end}</p></div><button className="quiet" aria-expanded={showLimits} onClick={() => setShowLimits(value => !value)}>Ограничения</button></> : <p>{meta.loading ? 'Загрузка метаданных API…' : 'Метаданные не загружены'}</p>}</div>
    {meta.error && <div className="meta-error"><Failure error={meta.error} retry={() => setRefresh(v => v + 1)} /></div>}
    {showLimits && meta.data && <div className="dataset-limits"><p>Роли — эвристические гипотезы, не вероятность виновности. Связь не доказывает происхождение конкретных денег.</p><ul>{meta.data.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="caption">Правила: {meta.data.config_version} · Алгоритм: {meta.data.algorithm_version} · Расчёт: {meta.data.duration_seconds.toFixed(3)} с</p></div>}
    {runId?.startsWith('example-synthetic-contract-only') && <div className="test-banner" role="status">Тестовый контракт · синтетические данные для проверки UI, не результат анализа</div>}
    {searchError && <div id="search-error" className="notice error" role="alert">{searchError}</div>}
    {notice && <div className="notice" role="status">{notice}<button className="quiet" onClick={() => setNotice('')} aria-label="Закрыть уведомление">×</button></div>}
    {fatal ? <Failure error={fatal} retry={reset} /> : <>
      <nav className="mobile-tabs" aria-label="Панели рабочего места">{(['network', 'queue', 'detail'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{({ network: 'Сеть', queue: 'Приоритеты', detail: 'Карточка' })[tab]}</button>)}</nav>
      <main className={`workspace view-${view}`}>
        <aside className="panel queue-panel" aria-label="Приоритеты"><div className="panel-heading"><div><span className="eyebrow">Очередь проверки</span><h1>Приоритеты</h1></div><span className="count-chip">{queue.data?.total ?? '—'}</span></div><div className="panel-body">
          {queue.loading && <Loading />}{queue.error && <Failure error={queue.error} retry={() => setRefresh(v => v + 1)} />}
          {queue.data && <Queue page={queue.data} filters={filters} selected={selected} selectedNode={detail.data} setFilters={setFilters} select={id => void select(id)} offset={offset} setOffset={setOffset} clusters={clusters} />}
        </div></aside>
        <div className={`center-column center-${centerView}`}>{selected && detail.data && <nav className="center-switch" aria-label="Граф и переводы"><button aria-pressed={centerView === 'graph'} onClick={() => setCenterView('graph')}><Icon name="network" />Граф</button><button aria-pressed={centerView === 'transfers'} onClick={() => setCenterView('transfers')}><Icon name="table" />Переводы</button><button className="dual-view" aria-pressed={centerView === 'both'} onClick={() => setCenterView('both')}>Вместе</button></nav>}
        <section className="panel network-panel" aria-label="Направленный граф"><div className="panel-heading"><div><span className="eyebrow">Наблюдаемая сеть</span><h2>{selected ? 'Окружение узла' : clusterId ? `Кластер ${clusterId}` : 'Обзор кластеров'}</h2></div><button className="quiet" onClick={() => openCluster(null)}>Обзор <Icon name="arrow" /></button></div>
          {selected && <div className="hop-controls"><span className="mono">{selected}</span><label>Шаги <select aria-label="Число шагов графа" value={hops} onChange={e => setHops(Number(e.target.value))}><option value="1">1</option><option value="2">2</option></select></label></div>}
          {graph.loading && <Loading text="Загрузка графа…" />}{graph.error && <Failure error={graph.error} retry={() => setGraphRefresh(v => v + 1)} />}
          {graph.data && <Network graph={graph.data} selected={selected} select={gid => void select(gid)} openCluster={openCluster} />}
        </section>
        {selected && detail.data && <section id="transfers" ref={transfersRef} tabIndex={-1} className="panel transfers-panel" aria-label="Переводы выбранного узла"><div className="panel-heading"><h2>Исходные переводы</h2><span className="mono caption">{selected}</span></div>
          {transfers.loading && <Loading text="Загрузка переводов…" />}{transfers.error && <Failure error={transfers.error} retry={() => setTransferRefresh(v => v + 1)} />}
          {transfers.data && <Transfers page={transfers.data} gid={selected} direction={direction} offset={transferOffset} setDirection={value => { setDirection(value); setTransferOffset(0); }} setOffset={setTransferOffset} select={gid => void select(gid)} />}
        </section>}</div>
        <aside className="panel detail-panel" aria-label="Карточка узла"><div className="panel-heading"><div><span className="eyebrow">Детали исследования</span><h2>Карточка узла</h2></div><button className="drawer-close quiet" onClick={() => { setView('network'); searchRef.current?.focus(); }}>Закрыть · Esc</button></div><div className="panel-body">
          {detail.loading && <Loading text={`Загрузка узла ${selected}…`} />}{detail.error && <Failure error={detail.error} retry={() => selected && void select(selected)} />}
          {detail.data && <NodePanel node={detail.data} showTransfers={showTransfers} openCluster={id => { openCluster(id); setView('detail'); }} />}
          {cluster.loading && <Loading text="Загрузка кластера…" />}{cluster.error && <Failure error={cluster.error} retry={() => setGraphRefresh(v => v + 1)} />}{cluster.data && <ClusterPanel cluster={cluster.data} select={gid => void select(gid)} />}
          {!detail.loading && !detail.error && !detail.data && !clusterId && <div className="state empty-detail"><span className="empty-symbol"><Icon name="network" /></span><span className="eyebrow">От связи к основанию</span><h3>Почему этот узел?</h3><p>Выберите узел в очереди или найдите полный gid. Здесь появятся роль, исходные переводы и ограничения вывода.</p><div className="empty-guide"><span>01 · Выберите узел</span><span>02 · Проверьте переводы</span><span>03 · Сравните гипотезы</span></div></div>}
        </div></aside>
      </main>
    </>}
    <footer><span>Локальный анализ · роли — гипотезы · только наблюдаемая выгрузка</span><span className="mono run">run_id: {runId ?? 'не загружен'}</span></footer>
  </div>;
}
