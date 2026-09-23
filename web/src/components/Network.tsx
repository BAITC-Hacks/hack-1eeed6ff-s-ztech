import { useEffect, useRef, useState } from 'react';
import { applyNetworkTheme, createNetwork, fitNetwork, updateNetwork } from '../network';
import { formatKzt, roleLabels, type Gid, type GraphResponse } from '../domain';
import { Icon } from './Icon';
import type { Theme } from '../theme';

export function Network({ theme, graph, selected, select, openCluster }: { theme: Theme; graph: GraphResponse; selected: Gid | null; select: (gid: Gid) => void; openCluster: (id: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof createNetwork> | null>(null);
  const callbacks = useRef({ select, openCluster });
  callbacks.current = { select, openCluster };
  const [table, setTable] = useState(false);
  useEffect(() => {
    const network = createNetwork(container.current!, gid => callbacks.current.select(gid), id => callbacks.current.openCluster(id), theme);
    instance.current = network;
    const observer = new ResizeObserver(() => fitNetwork(network.cy));
    observer.observe(container.current!);
    return () => { observer.disconnect(); network.dispose(); instance.current = null; };
  }, []);
  useEffect(() => { if (instance.current) applyNetworkTheme(instance.current.cy, theme); }, [theme]);
  useEffect(() => { if (instance.current) updateNetwork(instance.current.cy, graph, selected); }, [graph, selected]);
  useEffect(() => { if (!table && instance.current) fitNetwork(instance.current.cy); }, [table]);
  return <div className="network-content">
    <div className="graph-toolbar"><div className="button-group"><button onClick={() => instance.current?.cy.zoom(instance.current.cy.zoom() * 1.2)} aria-label="Приблизить граф">+</button><button onClick={() => instance.current?.cy.zoom(instance.current.cy.zoom() / 1.2)} aria-label="Отдалить граф">−</button><button onClick={() => instance.current && fitNetwork(instance.current.cy)}><Icon name="expand" />Вместить</button></div>
      <button aria-pressed={table} onClick={() => setTable(value => !value)}><Icon name={table ? 'network' : 'table'} />{table ? 'Показать граф' : 'Таблица связей'}</button></div>
    <div className="legend" aria-label="Легенда графа"><span><i className="legend-arrow">→</i> направление переводов</span><span><i className="legend-seed" /> seed</span><span><i className="legend-boundary" /> граница</span></div>
    <div className="cy-container" ref={container} style={{ display: table ? 'none' : 'block' }} role="img" aria-label={`Направленный граф: ${graph.nodes.length} узлов, ${graph.edges.length} связей. Доступная альтернатива — таблица связей.`} data-testid="network-canvas" />
    {table && <div className="network-table"><table><caption>Узлы текущего среза</caption><thead><tr><th>Узел</th><th>Роль / наблюдение</th></tr></thead><tbody>{graph.nodes.map(n => <tr key={n.id} aria-selected={n.gid === selected}><td><button className="mono link-button" onClick={() => n.kind === 'cluster' ? openCluster(n.cluster_id) : select(n.gid!)}>{n.gid ?? `Кластер ${n.cluster_id}`}</button></td><td>{n.role ? roleLabels[n.role] : `${n.n_nodes} узлов`}{n.boundary ? ' · Граница' : ''}{n.is_seed ? ' · Seed' : ''}</td></tr>)}</tbody></table>
      <table><caption>Исходные направления в срезе</caption><thead><tr><th>Откуда → куда</th><th>Сумма / переводы</th></tr></thead><tbody>{graph.edges.map(e => <tr key={e.id}><td className="mono">{e.source.replace(/^[nc]:/, '')}<br />→ {e.target.replace(/^[nc]:/, '')}</td><td>{formatKzt(e.sum_kzt)}<br />{e.n_tx} переводов</td></tr>)}</tbody></table></div>}
    <div className="graph-counts" aria-live="polite">Показано {graph.counts.shown_nodes} из {graph.counts.matched_nodes} узлов · {graph.counts.shown_edges} из {graph.counts.matched_edges} связей
      {graph.truncated && <p className="warning">Срез ограничен: сначала центр, затем ближайшие узлы по приоритету. Остальные доступны поиском.</p>}
      {!graph.edges.length && <p>{graph.truncated ? 'Связи могут быть за пределами показанного среза.' : 'В этом срезе нет наблюдаемых связей.'}</p>}
    </div>
  </div>;
}
