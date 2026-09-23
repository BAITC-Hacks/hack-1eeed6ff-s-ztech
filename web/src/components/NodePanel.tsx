import { useEffect, useState } from 'react';
import { formatKzt, roleLabels, score, type NodeDetail } from '../domain';

export function NodePanel({ node }: { node: NodeDetail }) {
  const [copy, setCopy] = useState('');
  useEffect(() => setCopy(''), [node.gid]);
  async function copyGid() {
    try { await navigator.clipboard.writeText(node.gid); setCopy('gid скопирован точно'); }
    catch { setCopy('Копирование недоступно. Выделите полный gid вручную.'); }
  }
  return <div className="node-detail" data-testid="node-detail" data-gid={node.gid}>
    <div className="gid-heading"><h2 className="mono">{node.gid}</h2><button onClick={copyGid} aria-label="Скопировать полный gid">Копировать</button></div>
    {copy && <p role="status" className="caption">{copy}</p>}
    <p className="caption">Кластер {node.cluster_id} · Глубина {node.depth}{node.is_seed ? ' · Seed' : ''}</p>
    {node.flags.includes('boundary') && <div className="notice warning"><strong>Граница выборки</strong><p>Четвёртое колено: отсутствие исходящих связей не доказывает накопление средств.</p></div>}
    {node.flags.includes('isolated') && <div className="notice">Изолированный узел. В этой выгрузке нет наблюдаемых связей.</div>}
    <section><p className="eyebrow">Основная гипотеза</p><h3 className={`role ${node.role}`}>{roleLabels[node.role]}</h3><p>{node.evidence}</p>
      <dl className="metrics"><div><dt>Соответствие правилу</dt><dd>{score(node.role_score)}</dd></div><div><dt>Приоритет проверки</dt><dd>{score(node.priority_score)}</dd></div></dl>
      <p className="caption">Эвристические оценки от 0 до 1, не вероятность виновности.</p>
    </section>
    <section><h3>Наблюдаемые потоки</h3><dl className="metrics"><div><dt>Вход</dt><dd>{formatKzt(node.in_kzt)}</dd></div><div><dt>Выход</dt><dd>{formatKzt(node.out_kzt)}</dd></div>
      <div><dt>Плательщики / получатели</dt><dd>{node.in_degree} / {node.out_degree}</dd></div><div><dt>Переводы: вход / выход</dt><dd>{node.in_tx} / {node.out_tx}</dd></div></dl></section>
    <section><h3>Ограничения наблюдения</h3>{node.limitations.length ? <ul>{node.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>API не указал дополнительных ограничений для узла.</p>}</section>
    <section><h3>Что проверить дальше</h3>{node.next_data_requests.length ? <ul>{node.next_data_requests.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>Дополнительные запросы в ответе API отсутствуют.</p>}</section>
  </div>;
}
