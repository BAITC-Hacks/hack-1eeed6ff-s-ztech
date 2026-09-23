# E1 — структурная симуляция, дополнение к API v1

G3 пройден на cd94bfb. Endpoint реализован и проверен A; `meta.features.removal=true`. Существующие GET-поля и CSV не меняются. Контракт опубликован до реализации UI. Включать действие «Структурная симуляция» после реальной проверки; отсутствие UI не мешает основному сценарию. Настоящий запрос/ответ: [v1.removal.actual.json](v1.removal.actual.json).

`POST /api/v1/experiments/removal`, `Content-Type: application/json`:

```json
{"gids":["900000000000000002"]}
```

От 1 до 3 **разных** точных строк gid. Числа JSON, дополнительные поля, пустой список, >3 и неправильный формат — 422 `INVALID_PARAMETER`/`INVALID_GID`. Повтор — 422 `DUPLICATE_GID`; отсутствующий узел — 404 `NODE_NOT_FOUND`. Ошибка имеет обычную оболочку `{error:{code,message,details},run_id}`.

Пример ниже **synthetic** для цепи A→B→C при удалении B:

```json
{
  "run_id":"synthetic-removal-chain",
  "method":"weak_components_remaining_nodes",
  "removed_gids":["900000000000000002"],
  "remaining_nodes":2,
  "removed_edges":2,
  "before":{"components":1,"largest_component_size":2,"largest_component_fraction":1.0,"connected_pairs":1},
  "after":{"components":2,"largest_component_size":1,"largest_component_fraction":0.5,"connected_pairs":0},
  "affected_pairs":1,
  "affected_pairs_fraction":1.0,
  "limitations":["Связность считается без учёта направления переводов.","Сравниваются только оставшиеся узлы; удаляемые узлы не входят в знаменатель.","Это структурная симуляция, не прогноз предотвращённых потерь и не банковское действие."]
}
```

`before` считается по исходным слабым компонентам, но размер каждой — число **оставшихся** вершин в ней; пути ещё могут проходить через удаляемые вершины. `after` — компоненты после удаления. Пары неупорядоченные, `n*(n-1)/2`. `affected_pairs=before.connected_pairs-after.connected_pairs`; доля делится на `before.connected_pairs`, при нуле — `null` («не определено»). `largest_component_fraction` делится на `remaining_nodes`, при нуле — `null`; число компонент и размер крупнейшей для пустого графа — 0.

Вычисление относится ко **всей наблюдаемой сети**, не только к текущему ограниченному ego-срезу. `removed_edges` считает направленные рёбра, инцидентные удаляемым вершинам, каждое один раз. Ответ содержит sorted exact `removed_gids`, `run_id` и ограничения. Кэш ограничен 128 комбинациями на расчёт. Вызов не меняет snapshot, роли, кластеры, priority или три CSV; ничего не блокирует в банке.

Для B: действие отдельно от основного приоритета; 1–3 узла, результат с run_id, доля/null и честный знаменатель. При изменении run_id сбросить старую симуляцию. Ошибки показывать без фиктивного успешного результата. До end-to-end проверки функция не считается завершённой.
