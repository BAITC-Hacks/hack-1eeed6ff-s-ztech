# Контракт v1 для Алишера

`v1.example.json` — **synthetic fixture**, все идентификаторы и числа вымышлены. Основной договор: `docs/hackalem/03_ARCHITECTURE_CONTRACTS.md`. Версия остаётся `1`; имена опубликованных полей сохранены. Нельзя использовать fixture как production fallback.

Уточнения ранее не детализированных оболочек, без изменения основных типов:

- `/api/v1/meta`: `counts` (nodes, edges, transactions, seeds, isolates, boundary, clusters), `period.start/end`, `total_kzt`, `limitations`, `config_version`, `algorithm_version`, `duration_seconds`, `source_hashes`, `features` (brief/removal/temporal/agent), `run_id`, `schema_version`.
- `/api/v1/clusters`: `{run_id, items: ClusterSummary[]}`.
- Transfers: `{run_id, items, total, offset, limit, direction, sum_kzt, in_kzt, out_kzt}`; суммы относятся ко всей выбранной direction, а не странице. При direction=in out_kzt=0 и наоборот.
- NodeDetail дополняется `raw_score`, `score_caps: {key,cap,reason}[]`, `supporting_transfers: {total,source_refs,url}`, `alternative: Candidate|null`.
- Graph: `mode=overview|ego|cluster`, `limit=1..1000` (default 250), hops=1|2. Root ego всегда включён; сохраняются исходные направления. `matched_*` относятся ко всему выбранному срезу до limit.
- Brief возвращает Markdown (`text/markdown`) с run_id в тексте и заголовке `X-Run-Id`. Экспорт CSV также содержит `X-Run-Id`.
- Все ошибки, в том числе валидации: `{error:{code,message,details},run_id}`.
- Пагинация списков: `offset>=0`, `limit=1..200`, default 50. Gid — строки; `*_kzt` — строки с двумя знаками. Полные имена CSV в URL экспорта.

Состояние передачи: fixture опубликован для ранней работы UI, backend ещё реализуется. Подтверждение со стороны B пока не получено. При появлении ветки B A сверяет domain.ts и api.ts с этим контрактом перед интеграцией. Никакие поля не меняются скрытно.
