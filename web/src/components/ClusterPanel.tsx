import { formatKzt, roleLabels, roles, type ClusterDetail, type Gid } from '../domain';
export function ClusterPanel({ cluster, select }: { cluster: ClusterDetail; select: (gid: Gid) => void }) {
  return <div className="node-detail"><h2>Кластер {cluster.cluster_id}</h2><p>{cluster.hypothesis}</p>
    <section><h3>Наблюдаемые данные</h3><dl className="metrics"><div><dt>Узлов / seed</dt><dd>{cluster.n_nodes} / {cluster.n_seed}</dd></div><div><dt>Граница выборки</dt><dd>{cluster.boundary_count}</dd></div><div><dt>Внутренний оборот</dt><dd>{formatKzt(cluster.sum_kzt_internal)}</dd></div><div><dt>Вход из других кластеров</dt><dd>{formatKzt(cluster.cross_in_kzt)}</dd></div><div><dt>Выход в другие кластеры</dt><dd>{formatKzt(cluster.cross_out_kzt)}</dd></div></dl></section>
    <section><h3>Роли</h3><dl className="metrics">{roles.map(role => <div key={role}><dt>{roleLabels[role]}</dt><dd>{cluster.role_counts[role]}</dd></div>)}</dl></section>
    <section><h3>Приоритетные узлы кластера</h3>{cluster.top_gids.map(gid => <div key={gid}><button className="mono link-button" onClick={() => select(gid)}>{gid}</button></div>)}</section>
    <p className="notice warning">Кластер — структурное сообщество наблюдаемого графа. Он не доказывает принадлежность к преступной группе.</p>
  </div>;
}
