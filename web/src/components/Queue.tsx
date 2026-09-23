import { emptyFilters, roleLabels, roles, score, type Filters, type Gid, type NodePage } from '../domain';

export function Queue({ page, filters, selected, setFilters, select, offset, setOffset }: {
  page: NodePage; filters: Filters; selected: Gid | null; setFilters: (f: Filters) => void;
  select: (id: Gid) => void; offset: number; setOffset: (offset: number) => void;
}) {
  return <>
    <div className="filters">
      <label>Роль<select aria-label="Роль" value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value as Filters['role'] })}>
        <option value="">Все роли</option>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
      </select></label>
      <label className="check"><input type="checkbox" checked={filters.boundary} onChange={e => setFilters({ ...filters, boundary: e.target.checked })} />Граница выборки</label>
      <label className="check"><input type="checkbox" checked={filters.is_seed} onChange={e => setFilters({ ...filters, is_seed: e.target.checked })} />Только seed</label>
      <button className="quiet" onClick={() => setFilters(emptyFilters)}>Сбросить фильтры</button>
    </div>
    <p className="caption">По приоритету проверки · {page.total} в выборке</p>
    {!page.items.length ? <div className="state"><strong>Ничего не найдено</strong><p>Измените или сбросьте фильтры.</p></div> :
      <ol className="queue-list" aria-label="Очередь узлов">{page.items.map(node => <li key={node.gid}>
        <button className={`queue-item ${selected === node.gid ? 'selected' : ''}`} aria-pressed={selected === node.gid} onClick={() => select(node.gid)}>
          <span className="mono gid">{node.gid}</span><span className={`role ${node.role}`}>{roleLabels[node.role]}</span>
          <span className="queue-score">Приоритет <b>{score(node.priority_score)}</b></span><span className="reason">{node.evidence}</span>
          {node.flags.includes('boundary') && <span className="badge warning">Граница выборки</span>}{node.is_seed && <span className="badge">Seed</span>}
        </button>
      </li>)}</ol>}
    <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Назад</button>
      <span>{page.items.length ? `${offset + 1}–${offset + page.items.length}` : '0'} из {page.total}</span>
      <button disabled={offset + page.items.length >= page.total} onClick={() => setOffset(offset + 50)}>Далее</button></div>
  </>;
}
