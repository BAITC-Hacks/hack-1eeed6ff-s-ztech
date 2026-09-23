import { parseNodeDetail, parseNodePage } from './contract';
import { validGid, type Filters, type Gid } from './domain';

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
