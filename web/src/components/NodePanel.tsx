import { useEffect, useState } from 'react';
import { formatKzt, roleLabels, score, type Direction, type NodeDetail } from '../domain';
import { RuleChecks } from './RuleChecks';
import { Icon } from './Icon';

export function NodePanel({ node, showTransfers, openCluster }: { node: NodeDetail; showTransfers: (direction: Direction) => void; openCluster: (id: number) => void }) {
  const [copy, setCopy] = useState('');
  useEffect(() => setCopy(''), [node.gid]);
  async function copyGid() {
    try { await navigator.clipboard.writeText(node.gid); setCopy('gid скопирован точно'); }
    catch { setCopy('Копирование недоступно. Выделите полный gid вручную.'); }
  }
  return <div className="node-detail" data-testid="node-detail" data-gid={node.gid}>
    <div className="gid-heading"><div><p className="eyebrow">Идентификатор узла</p><h2 className="mono">{node.gid}</h2></div><button className="icon-button" onClick={copyGid} aria-label="Скопировать полный gid" title="Копировать gid"><Icon name="copy" /></button></div>
    {copy && <p role="status" className="caption">{copy}</p>}
    <p className="caption node-meta"><button className="link-button" onClick={() => openCluster(node.cluster_id)}>Кластер {node.cluster_id} <Icon name="arrow" /></button><span>Глубина {node.depth}</span>{node.is_seed && <span className="badge">Seed</span>}</p>
    {node.flags.includes('boundary') && <div className="notice warning"><strong>Граница выборки</strong><p>Четвёртое колено: отсутствие исходящих связей не доказывает накопление средств.</p></div>}
    {node.flags.includes('isolated') && <div className="notice">Изолированный узел. В этой выгрузке нет наблюдаемых связей.</div>}
    <section className="role-summary"><p className="eyebrow">Основная гипотеза</p><h3 className={`role ${node.role}`}>{roleLabels[node.role]}</h3><p className="evidence-text">{node.evidence}</p>
      <dl className="metrics score-pair"><div><dt>Соответствие правилу</dt><dd>{score(node.role_score)}</dd></div><div><dt>Приоритет проверки</dt><dd>{score(node.priority_score)}</dd></div></dl>
      <p className="caption">Эвристические оценки от 0 до 1, не вероятность виновности.</p>
    </section>
    <nav className="detail-jumps" aria-label="Разделы карточки"><a href="#node-evidence">Основания</a><a href="#node-hypotheses">Альтернатива</a><a href="#node-limits">Ограничения</a></nav>
    <section className="flow-section"><h3>Наблюдаемые потоки</h3><dl className="metrics flow-metrics"><div><dt>Вход <span aria-hidden="true">↙</span></dt><dd><button className="link-button" aria-label="Показать входящие переводы" aria-describedby="node-flow-in-value" onClick={() => showTransfers('in')}><span id="node-flow-in-value">{formatKzt(node.in_kzt)}</span></button></dd></div><div><dt>Выход <span aria-hidden="true">↗</span></dt><dd><button className="link-button" aria-label="Показать исходящие переводы" aria-describedby="node-flow-out-value" onClick={() => showTransfers('out')}><span id="node-flow-out-value">{formatKzt(node.out_kzt)}</span></button></dd></div>
      <div><dt>Плательщики / получатели</dt><dd>{node.in_degree} / {node.out_degree}</dd></div><div><dt>Переводы: вход / выход</dt><dd>{node.in_tx} / {node.out_tx}</dd></div></dl></section>
    <p><a className="link-button" href="#transfers" onClick={() => showTransfers('all')}>Проверить исходные переводы ({node.supporting_transfers.total})</a></p>
    <section id="node-evidence" tabIndex={-1}><h3>Основание роли</h3><p className="mono caption">{node.role_rule_id}</p>
      <p className="caption">До ограничений: {score(node.raw_score)} · После: {score(node.role_score)}</p>
      {node.candidates.filter(c => c.role === node.role).map(c => <RuleChecks key={c.role} candidate={c} />)}
      {node.score_caps.map(cap => <p key={cap.key} className="notice warning">Предел {score(cap.cap)}: {cap.reason}</p>)}
    </section>
    <section><h3>Вклад в приоритет</h3><ul className="contributions">{node.priority_contributions.map(c => <li key={c.key}><div><span>{c.label}</span><b>{score(c.contribution)}</b></div><div className="contribution-track" aria-hidden="true"><span style={{ width: `${Math.min(100, c.contribution * 100)}%` }} /></div><p className="caption">Нормированное: {score(c.normalized)} · вес: {score(c.weight)}</p></li>)}</ul></section>
    <section id="node-hypotheses" tabIndex={-1}><h3>Альтернативная гипотеза</h3>{node.alternative ? <><h3 className={`role ${node.alternative.role}`}>{roleLabels[node.alternative.role]}</h3><p>Соответствие: {score(node.alternative.capped_score)} · {node.alternative.eligible ? 'Условия допуска выполнены' : 'Условия допуска не выполнены'}</p><RuleChecks candidate={node.alternative} /></> : <p>API не выделил допустимую альтернативу. Дополнительная гипотеза не сформирована.</p>}
      <details><summary>Все проверенные роли ({node.candidates.length})</summary>{node.candidates.map(c => <div className="candidate" key={c.role}><h3 className={`role ${c.role}`}>{roleLabels[c.role]}</h3><p className="caption">{c.eligible ? 'Допустима' : 'Не допущена'} · До ограничений {score(c.raw_score)} · После {score(c.capped_score)}</p><RuleChecks candidate={c} /></div>)}</details>
    </section>
    <section id="node-limits" tabIndex={-1}><h3>Ограничения наблюдения</h3>{node.limitations.length ? <ul>{node.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>API не указал дополнительных ограничений для узла.</p>}</section>
    <section><h3>Что проверить дальше</h3>{node.next_data_requests.length ? <ul>{node.next_data_requests.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>Дополнительные запросы в ответе API отсутствуют.</p>}</section>
  </div>;
}
