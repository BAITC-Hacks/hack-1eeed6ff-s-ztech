import { useEffect, useRef, useState } from 'react';
import { ApiSession, LatestRequest } from '../api';
import { exportNames, type ExportName } from '../domain';
export function Exports({ api, fail }: { api: ApiSession; fail: (error: unknown) => Error }) {
  const [name, setName] = useState<ExportName>('nodes_roles.csv');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const request = useRef(new LatestRequest());
  const urls = useRef(new Set<string>());
  useEffect(() => () => { request.current.cancel(); urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear(); }, []);
  async function download() {
    const latest = request.current.start(); setPending(true); setMessage(''); setError(false);
    try {
      const blob = await api.download(name, latest.signal);
      if (!latest.isCurrent()) return;
      const url = URL.createObjectURL(blob); urls.current.add(url);
      const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
      setMessage(`${name}: файл передан браузеру. run_id проверен.`);
      // Revoke after the browser has consumed the download URL; unmount also cleans all URLs.
      setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000);
    } catch (error) { if (latest.isCurrent()) { setMessage(fail(error).message); setError(true); } }
    finally { if (latest.isCurrent()) setPending(false); }
  }
  return <div className="exports"><label className="sr-only" htmlFor="export-name">Файл для выгрузки</label><select id="export-name" value={name} disabled={pending} onChange={e => setName(e.target.value as ExportName)}>{exportNames.map(value => <option key={value}>{value}</option>)}</select><button disabled={pending} onClick={() => void download()}>{pending ? 'Скачивание…' : error ? 'Повторить CSV' : 'Скачать CSV'}</button>
    {message && <p className={`export-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{message}<button className="quiet" onClick={() => setMessage('')} aria-label="Закрыть сообщение выгрузки">×</button></p>}</div>;
}
