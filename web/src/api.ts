import { parseClusterDetail, parseClusters, parseGraph, parseMeta, parseNodeDetail, parseNodePage, parseTransfers } from './contract';
import { exportNames, validGid, type Direction, type ExportName, type Filters, type Gid } from './domain';

export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code = 'NETWORK_ERROR') { super(message); this.name = 'ApiError'; }
}
export class SnapshotChanged extends ApiError {
  constructor() { super('Расчёт изменился. Обновите рабочее место, чтобы загрузить единый набор данных.', 409, 'SNAPSHOT_CHANGED'); }
}
export async function requestJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try { response = await fetch(path, { signal, cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Не удалось связаться с локальным API. Проверьте запуск сервера и повторите запрос.');
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ApiError(`API вернул ответ без корректного JSON (HTTP ${response.status}).`, response.status, 'INVALID_RESPONSE'); }
  if (!response.ok) {
    const body = value as { error?: { message?: unknown; code?: unknown } } | null;
    throw new ApiError(typeof body?.error?.message === 'string' ? body.error.message : `Ошибка API (HTTP ${response.status}).`, response.status, typeof body?.error?.code === 'string' ? body.error.code : 'HTTP_ERROR');
  }
  return value;
}
export class ApiSession {
  runId: string | null = null;
  private invalid = false;
  accept<T extends { run_id: string }>(value: T): T {
    if (this.invalid || (this.runId !== null && this.runId !== value.run_id)) {
      this.invalid = true; throw new SnapshotChanged();
    }
    this.runId = value.run_id; return value;
  }
  async nodes(filters: Filters, offset: number, signal: AbortSignal) {
    const query = new URLSearchParams({ offset: String(offset), limit: '50' });
    if (filters.role) query.set('role', filters.role);
    if (filters.cluster_id) query.set('cluster_id', filters.cluster_id);
    if (filters.boundary) query.set('boundary', 'true');
    if (filters.is_seed) query.set('is_seed', 'true');
    const value = parseNodePage(await requestJson(`/api/v1/nodes?${query}`, signal));
    signal.throwIfAborted(); return this.accept(value);
  }
  async node(gid: Gid, signal: AbortSignal) {
    if (!validGid(gid)) throw new ApiError('Введите полный gid: от 1 до 19 цифр в диапазоне int64.', 422, 'INVALID_GID');
    const value = parseNodeDetail(await requestJson(`/api/v1/nodes/${encodeURIComponent(gid)}`, signal));
    signal.throwIfAborted();
    if (value.gid !== gid) throw new ApiError('API вернул другой gid. Карточка не показана.', 502, 'GID_MISMATCH');
    return this.accept(value);
  }
  async graph(gid: Gid | null, clusterId: number | null, hops: number, signal: AbortSignal) {
    const mode = gid ? 'ego' : clusterId !== null ? 'cluster' : 'overview';
    const query = new URLSearchParams({ mode, limit: '250' });
    if (gid) { query.set('gid', gid); query.set('hops', String(hops)); }
    if (mode === 'cluster') query.set('cluster_id', String(clusterId));
    const value = parseGraph(await requestJson(`/api/v1/graph?${query}`, signal));
    signal.throwIfAborted();
    if (value.scope.mode !== mode || (gid && value.scope.gid !== gid) || (mode === 'cluster' && value.scope.cluster_id !== clusterId)) {
      throw new ApiError('API вернул граф другого среза.', 502, 'GRAPH_SCOPE_MISMATCH');
    }
    return this.accept(value);
  }
  async meta(signal: AbortSignal) {
    const value = parseMeta(await requestJson('/api/v1/meta', signal)); signal.throwIfAborted(); return this.accept(value);
  }
  async clusters(signal: AbortSignal) {
    const value = parseClusters(await requestJson('/api/v1/clusters', signal)); signal.throwIfAborted(); return this.accept(value);
  }
  async cluster(id: number, signal: AbortSignal) {
    const value = parseClusterDetail(await requestJson(`/api/v1/clusters/${id}`, signal)); signal.throwIfAborted();
    if (value.cluster_id !== id) throw new ApiError('API вернул другой кластер.', 502, 'CLUSTER_MISMATCH');
    return this.accept(value);
  }
  async transfers(gid: Gid, direction: Direction, offset: number, signal: AbortSignal) {
    const query = new URLSearchParams({ direction, offset: String(offset), limit: '50' });
    const value = parseTransfers(await requestJson(`/api/v1/nodes/${encodeURIComponent(gid)}/transfers?${query}`, signal));
    signal.throwIfAborted();
    if (value.direction !== direction || value.items.some(t => (direction === 'in' ? t.dst !== gid : direction === 'out' ? t.src !== gid : t.src !== gid && t.dst !== gid))) {
      throw new ApiError('API вернул переводы другого узла или направления.', 502, 'TRANSFER_SCOPE_MISMATCH');
    }
    return this.accept(value);
  }
  async download(name: ExportName, signal: AbortSignal): Promise<Blob> {
    if (!exportNames.includes(name)) throw new ApiError('Неизвестная выгрузка.', 422, 'INVALID_EXPORT');
    let response: Response;
    try { response = await fetch(`/api/v1/exports/${name}`, { signal, cache: 'no-store' }); }
    catch (error) { if (signal.aborted) throw error; throw new ApiError('API недоступен. Файл не скачан. Повторите запрос.'); }
    if (!response.ok) throw new ApiError(`Не удалось скачать ${name} (HTTP ${response.status}).`, response.status);
    const runId = response.headers.get('X-Run-Id');
    if (!runId || !response.headers.get('content-type')?.includes('text/csv') || !response.headers.get('content-disposition')?.includes('attachment')) {
      throw new ApiError('API не подтвердил CSV, attachment или X-Run-Id. Файл не скачан.', 502, 'INVALID_EXPORT_RESPONSE');
    }
    const blob = await response.blob(); signal.throwIfAborted(); this.accept({ run_id: runId });
    if (!blob.size) throw new ApiError('API вернул пустой файл.', 502, 'EMPTY_EXPORT');
    return blob;
  }
}

// Abort transport AND invalidate completion: protects even non-cancellable requests.
export class LatestRequest {
  private current?: AbortController;
  private version = 0;
  start() {
    this.cancel(); const version = this.version;
    const controller = new AbortController(); this.current = controller;
    return { signal: controller.signal, isCurrent: () => this.version === version && !controller.signal.aborted };
  }
  cancel() { this.current?.abort(); this.version += 1; }
}
