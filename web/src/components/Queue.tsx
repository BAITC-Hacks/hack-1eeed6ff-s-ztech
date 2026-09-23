import { emptyFilters, roleLabels, roles, score, type ClusterSummary, type Filters, type Gid, type NodePage, type NodeSummary } from '../domain';

export function Queue({ page, filters, selected, selectedNode, setFilters, select, offset, setOffset, clusters }: {
  page: NodePage; filters: Filters; selected: Gid | null; setFilters: (f: Filters) => void;
  select: (id: Gid) => void; offset: number; setOffset: (offset: number) => void;
  clusters: ClusterSummary[];
  selectedNode: NodeSummary | null;
}) {
  return <>
    <div className="filters">
      <label>Роль<select aria-label="Роль" value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value as Filters['role'] })}>
        <option value="">Все роли</option>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
      </select></label>
      {clusters.length > 0 && <label>Кластер<select aria-label="Кластер" value={filters.cluster_id} onChange={e => setFilters({ ...filters, cluster_id: e.target.value })}><option value="">Все кластеры</option>{clusters.map(c => <option value={c.cluster_id} key={c.cluster_id}>{c.cluster_id} · {c.n_nodes} узлов</option>)}</select></label>}
      <label className="check"><input type="checkbox" checked={filters.boundary} onChange={e => setFilters({ ...filters, boundary: e.target.checked })} />Граница выборки</label>
      <label className="check"><input type="checkbox" checked={filters.is_seed} onChange={e => setFilters({ ...filters, is_seed: e.target.checked })} />Только seed</label>
      <button className="quiet" onClick={() => setFilters(emptyFilters)}>Сбросить фильтры</button>
    </div>
    <p className="queue-order"><span>По приоритету проверки</span><span>↓</span></p>
    {selectedNode && selectedNode.gid === selected && !page.items.some(n => n.gid === selected) && <div className="outside-selection"><p className="caption">Выбран вне текущей страницы очереди</p><button className="queue-item selected" aria-pressed="true" onClick={() => select(selectedNode.gid)}><span className="mono gid">{selectedNode.gid}</span><span className={`role ${selectedNode.role}`}>{roleLabels[selectedNode.role]}</span><span className="queue-score">Приоритет <b>{score(selectedNode.priority_score)}</b></span></button></div>}
    {!page.items.length ? <div className="state"><strong>Ничего не найдено</strong><p>Измените или сбросьте фильтры.</p></div> :
      <ol className="queue-list" aria-label="Очередь узлов">{page.items.map(node => <li key={node.gid}>
        <button className={`queue-item ${selected === node.gid ? 'selected' : ''}`} aria-pressed={selected === node.gid} onClick={() => select(node.gid)}>
          <span className="queue-topline"><span className="mono gid">{node.gid}</span><span className="queue-value" title="Приоритет проверки"><span className="sr-only">Приоритет </span>{score(node.priority_score)}</span></span>
          <span className="queue-meta"><span className={`role ${node.role}`}>{roleLabels[node.role]}</span>{node.flags.includes('boundary') && <span className="badge warning">Граница выборки</span>}{node.is_seed && <span className="badge">Seed</span>}</span>
          <span className="reason" title={node.evidence}>{node.evidence}</span>
        </button>
      </li>)}</ol>}
    <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Назад</button>
      <span>{page.items.length ? `${offset + 1}–${offset + page.items.length}` : '0'} из {page.total}</span>
      <button disabled={offset + page.items.length >= page.total} onClick={() => setOffset(offset + 50)}>Далее</button></div>
  </>;
}
