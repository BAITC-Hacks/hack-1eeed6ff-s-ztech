import { useEffect, useRef, useState } from 'react';
import { applyNetworkTheme, createNetwork, fitNetwork, focusNetwork, detailNetwork, labelNetwork, updateNetwork, zoomNetwork } from '../network';
import { formatKzt, roleLabels, roles, type Gid, type GraphResponse } from '../domain';
import { Icon } from './Icon';
import type { Theme } from '../theme';

type Props = { theme: Theme; graph: GraphResponse; selected: Gid | null; select: (gid: Gid) => void; openCluster: (id: number) => void; expanded: boolean; toggleExpanded: () => void };
export function Network({ theme, graph, selected, select, openCluster, expanded, toggleExpanded }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof createNetwork> | null>(null);
  const needsFit = useRef(true);
  const [layout, setLayout] = useState<'network' | 'grid'>(graph.scope.mode === 'overview' ? 'grid' : 'network');
  const [table, setTable] = useState(false);
  const [tablePart, setTablePart] = useState<'nodes' | 'edges'>('nodes');
  const [zoom, setZoom] = useState(1);
  const [labels, setLabels] = useState('auto');
  const [focusId, setFocusId] = useState(graph.scope.mode === 'overview' ? graph.nodes[0]?.id ?? '' : '');
  const [hover, setHover] = useState<string | null>(null);
  const latest = useRef({ select, openCluster, graph, selected, layout, labels, focusId });
  latest.current = { select, openCluster, graph, selected, layout, labels, focusId };
  const overview = graph.scope.mode === 'overview';
  useEffect(() => {
    const network = createNetwork(container.current!, gid => latest.current.select(gid), id => latest.current.openCluster(id), theme, setHover);
    instance.current = network;
    const camera = () => { setZoom(network.cy.zoom()); detailNetwork(network.cy); };
    network.cy.on('zoom', camera);
    const observer = new ResizeObserver(() => {
      if (!container.current?.clientWidth || !container.current.clientHeight) return;
      network.cy.resize();
      // A graph mounted in the hidden mobile panel gets its first layout on reveal.
      if (needsFit.current) {
        updateNetwork(network.cy, latest.current.graph, latest.current.selected, latest.current.layout);
        labelNetwork(network.cy, latest.current.labels === 'all');
        focusNetwork(network.cy, latest.current.focusId || null);
        detailNetwork(network.cy);
        needsFit.current = false;
      }
    });
    observer.observe(container.current!);
    return () => { observer.disconnect(); network.dispose(); instance.current = null; };
  }, []);
  useEffect(() => { if (instance.current) applyNetworkTheme(instance.current.cy, theme); }, [theme]);
  useEffect(() => {
    if (!instance.current) return;
    updateNetwork(instance.current.cy, graph, selected, layout);
    needsFit.current = !container.current?.clientWidth || !container.current.clientHeight;
    setHover(null);
  }, [graph, selected, layout]);
  useEffect(() => { setFocusId(graph.scope.mode === 'overview' ? graph.nodes[0]?.id ?? '' : ''); }, [graph]);
  useEffect(() => { if (instance.current) { labelNetwork(instance.current.cy, labels === 'all'); detailNetwork(instance.current.cy); } }, [labels, graph, layout]);
  useEffect(() => { if (instance.current) focusNetwork(instance.current.cy, focusId || null); }, [focusId, graph, layout]);
  useEffect(() => {
    if (table) return;
    const frame = requestAnimationFrame(() => instance.current?.cy.resize());
    return () => cancelAnimationFrame(frame);
  }, [table]);
  const focused = graph.nodes.find(node => node.id === focusId);
  const hint = hover ?? (focused ? `${focused.kind === 'cluster' ? `Кластер ${focused.cluster_id}` : focused.gid}: выделены прямые связи; остальные остаются на графе.` : `${overview ? 'Нажмите на кластер, чтобы открыть его узлы.' : 'Нажмите на узел, чтобы открыть карточку.'} Колесо — масштаб, фон — перемещение.`);
  return <div className="network-content">
    <div className="graph-toolbar"><div className="button-group"><button disabled={zoom >= 3.999} onClick={() => instance.current && zoomNetwork(instance.current.cy, 1.25)} aria-label="Приблизить граф">+</button><button disabled={zoom <= .1501} onClick={() => instance.current && zoomNetwork(instance.current.cy, .8)} aria-label="Отдалить граф">−</button><output className="graph-zoom" aria-label="Масштаб графа">{Math.round(zoom * 100)}%</output><button onClick={() => instance.current && fitNetwork(instance.current.cy)}><Icon name="expand" />Вместить</button><button id="graph-expand" onClick={toggleExpanded} aria-pressed={expanded} title={expanded ? 'Свернуть граф · Escape' : 'Развернуть граф'} aria-label={expanded ? 'Свернуть граф' : 'Развернуть граф'}><Icon name={expanded ? 'back' : 'expand'} /></button></div>
      <button aria-pressed={table} onClick={() => setTable(value => !value)}><Icon name={table ? 'network' : 'table'} />{table ? 'Показать граф' : 'Таблица связей'}</button></div>
    {!table && <div className="graph-options">{overview && <label>Вид<select aria-label="Раскладка кластеров" value={layout} onChange={event => setLayout(event.target.value as 'network' | 'grid')}><option value="network">Сеть</option><option value="grid">Сетка</option></select></label>}<label>{overview ? 'Связи кластера' : 'Связи узла'}<select aria-label="Подсветить связи" value={focusId} onChange={event => setFocusId(event.target.value)}><option value="">Все связи</option>{graph.nodes.map(node => <option key={node.id} value={node.id}>{node.kind === 'cluster' ? `Кластер ${node.cluster_id} · ${node.n_nodes} узлов` : node.gid}</option>)}</select></label><label>Подписи<select aria-label="Подписи графа" value={labels} onChange={event => setLabels(event.target.value)}><option value="auto">Авто</option><option value="all">Все</option></select></label></div>}
    <div className="legend" aria-label="Легенда графа"><span><i className="legend-arrow">→</i> {overview ? 'между кластерами' : 'направление переводов'}</span><span><i className="legend-seed" /> {overview ? 'есть seed' : 'seed'}</span><span><i className="legend-boundary" /> {overview ? 'есть узлы на границе' : 'граница'}</span>{!overview && <details className="role-legend"><summary>Цвета ролей</summary><div>{roles.map(role => <span key={role} className={`role ${role}`}>{roleLabels[role]}</span>)}</div></details>}</div>
    <div className="cy-container" ref={container} style={{ display: table ? 'none' : 'block' }} role="img" aria-label={`Направленный граф: ${graph.nodes.length} ${overview ? 'кластеров' : 'узлов'}, ${graph.edges.length} связей. Доступная альтернатива — таблица связей.`} data-testid="network-canvas" />
    {table && <div className="network-table"><nav className="graph-table-tabs" aria-label="Содержимое таблицы графа"><button aria-pressed={tablePart === 'nodes'} onClick={() => setTablePart('nodes')}>{overview ? 'Кластеры' : 'Узлы'} · {graph.nodes.length}</button><button aria-pressed={tablePart === 'edges'} onClick={() => setTablePart('edges')}>Связи · {graph.edges.length}</button></nav>
      {tablePart === 'nodes' ? <table><caption>{overview ? 'Кластеры текущего среза' : 'Узлы текущего среза'}</caption><thead><tr><th>{overview ? 'Кластер' : 'Узел'}</th><th>Роль / наблюдение</th></tr></thead><tbody>{graph.nodes.map(n => <tr key={n.id} aria-selected={n.gid !== null && n.gid === selected}><td><button className="mono link-button" onClick={() => n.kind === 'cluster' ? openCluster(n.cluster_id) : select(n.gid!)}>{n.gid ?? `Кластер ${n.cluster_id}`}</button></td><td>{n.role ? roleLabels[n.role] : `${n.n_nodes} узлов`}{n.boundary ? ' · Граница' : ''}{n.is_seed ? ' · Seed' : ''}</td></tr>)}</tbody></table>
      : <table><caption>Исходные направления в срезе</caption><thead><tr><th>Откуда → куда</th><th>Сумма / переводы</th></tr></thead><tbody>{graph.edges.map(e => <tr key={e.id}><td className="mono">{e.source.startsWith('c:') ? `Кластер ${e.source.slice(2)}` : e.source.slice(2)}<br />→ {e.target.startsWith('c:') ? `Кластер ${e.target.slice(2)}` : e.target.slice(2)}</td><td>{formatKzt(e.sum_kzt)}<br />{e.n_tx} переводов</td></tr>)}</tbody></table>}
    </div>}
    {!table && <p className="graph-hint" title={hint}>{hint}</p>}
    <div className="graph-counts" aria-live="polite">Показано {graph.counts.shown_nodes} из {graph.counts.matched_nodes} {overview ? 'кластеров' : 'узлов'} · {graph.counts.shown_edges} из {graph.counts.matched_edges} связей
      {labels === 'auto' && zoom < (overview ? .3 : .77) && !table && <span className="zoom-hint">Приблизьте для подписей или выберите «Все».</span>}
      {graph.truncated && <p className="warning">Срез ограничен: сначала центр, затем ближайшие узлы по приоритету. Остальные доступны поиском.</p>}
      {!graph.edges.length && <p>{graph.truncated ? 'Связи могут быть за пределами показанного среза.' : 'В этом срезе нет наблюдаемых связей.'}</p>}
    </div>
  </div>;
}
