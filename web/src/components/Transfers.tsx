import { formatKzt, type Direction, type Gid, type TransferPage } from '../domain';

export function Transfers({ page, gid, direction, offset, setDirection, setOffset, select }: { page: TransferPage; gid: Gid; direction: Direction; offset: number; setDirection: (value: Direction) => void; setOffset: (value: number) => void; select: (gid: Gid) => void }) {
  return <>
    <div className="transfer-toolbar"><label>Направление <select aria-label="Направление переводов" value={direction} onChange={e => setDirection(e.target.value as Direction)}><option value="all">Все</option><option value="in">Входящие</option><option value="out">Исходящие</option></select></label>
      <span className="caption">Всего: {page.total} · <b>{formatKzt(page.sum_kzt)}</b><br />Сумма всей выборки, не страницы</span></div>
    {!page.items.length ? <p className="state">В выбранном направлении нет наблюдаемых переводов.</p> : <div className="transfer-scroll"><table aria-label="Исходные переводы"><thead><tr><th>Дата / основание</th><th>Откуда → куда</th><th>Сумма, KZT</th></tr></thead><tbody>{page.items.map(t => <tr key={t.source_ref} id={t.source_ref}><td><span>{t.date}</span><details className="source-details"><summary>Строка {t.source_row}</summary><span className="mono">{t.source_ref}</span><p>transactions.parquet · позиция {t.source_row}, начиная с 0. Локальная ссылка на исходную строку, не банковский ID.</p></details></td>
      <td><button className={`mono link-button ${t.src === gid ? 'current-gid' : ''}`} onClick={() => select(t.src)}>{t.src}</button><br /><span aria-hidden="true">→ </span><button className={`mono link-button ${t.dst === gid ? 'current-gid' : ''}`} onClick={() => select(t.dst)}>{t.dst}</button></td><td className="money">{formatKzt(t.sum_kzt)}</td></tr>)}</tbody></table></div>}
    <div className="pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Назад</button><span>{page.items.length ? `${offset + 1}–${offset + page.items.length}` : '0'} из {page.total}</span><button disabled={offset + page.items.length >= page.total} onClick={() => setOffset(offset + 50)}>Далее</button></div>
  </>;
}
