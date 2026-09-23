# Журнал Мейрама — зона A

## A0 — 23.09.2026, начало 14:22 Астана

План: docs/hackalem/05_IMPLEMENTATION_PLAN.md; спецификация 01/02/03, матрица 06.
Проверены официальный remote, чистый отдельный clone, исходный HEAD `26dfda5`, отсутствие application code. Ветка A `codex/analysis-core`; ветки B на remote на момент проверки ещё нет. Родительский репозиторий home не используется.

Сокращённый маршрут: A1+A2 → A3 → интеграция/проверка; последние 45 минут резервируются под выпуск и подачу. E2/LLM не входят в первоочередную реализацию. После обязательных проверок оценить доступный запас.

Контракт v1 + явно synthetic fixture опубликованы в contracts/. Неопределённые ранее оболочки meta/cluster-list/transfers уточнены в contracts/README.md. Основные типы и архитектура сохранены; подтверждение B ожидается.

Pre-flight: loader сохраняет int gid/tiyin/source_row → graph/metrics; clusters → participation → roles → ranking → cluster summaries; snapshot → CSV/API → B. Циклических зависимостей нет. Ruling: журнал плана ведётся здесь по требованиям пользователя вместо дублирующего временного ledger; риск — отсутствует при сохранении настоящих команд/коммитов.

Монитор remote каждые 10 минут до 18:00 + ручной fetch перед каждой интеграцией. `web/` не редактируется зоной A.

A0 evidence: `pip check` → No broken requirements; imports pandas/numpy/pyarrow/networkx/scipy/fastapi/pydantic/uvicorn → OK. Manifest всех оригинальных файлов совпадает; fixture JSON разбирается и сохраняет разные длинные gid. G0 со стороны A выполнен, независимое подтверждение B не заявляется. macOS 26.6.2 arm64, Apple M4, 16 GiB RAM.

## A1 — 2026-09-23T14:29:36+05:00

Реализованы loader и directed graph. Проверки: `python -m pytest tests -q` → 21 passed; `ruff check app tests` → 2 ошибки сортировки импортов; исправлены и повторно проверяются на A2. До реализации тесты не собирались из-за отсутствовавшего app.loader. Проверено D01–D09; официальный audit в `docs/hackalem/evidence/a1-loader.json`. Деньги берутся из всех исходных tx в целых тиынах; расхождение edges до одного тиына фиксируется явно. Исходные source_row стабильны. Review: убран неявный fallback парсинга дат; даты проверяются в ISO-формате. Исправлена ошибочно введённая вручную метка 14:34 в STATUS на фактическое время; история коммитов не менялась. Следующий этап A2.

## A2 и экспорт A3 — 2026-09-23T14:38:53+05:00

Реализованы взвешенная Louvain-проекция (оба направления суммируются), singleton-кластеры, PageRank, невзвешенный sampled betweenness, seed BFS, participation, шесть критериев ролей/caps, raw-score tie-break, пять вкладов приоритета. Объяснения указывают реальные исходные строки; три CSV и snapshot созданы.

`python -m pytest tests -q` → 43 passed; `ruff check app tests` → All checks passed. Реальный вызов run_pipeline на official: wall 0.808 s (включая проверку и публикацию каталога); 2248 nodes, 3119 edges, 4840 tx, 89 clusters, 50 top. Распределение: consolidator 113, distributor 102, coordinator 8, transit 63, peripheral 884, terminal 1078. Все 444 boundary не terminal. Два запуска и permutation дают одинаковые CSV; 19 изолятов сохранены.

Review: 6 тестов экспорта сначала падали из-за ошибочной fixture, размещавшей out внутри raw. Разнесены тестовые каталоги; защиту raw не ослабляли. До первой реализации модулей соответствующие тесты падали на отсутствии app.clusters/app.pipeline. Исправлены ранее обнаруженные ошибки импортов. Публикация результата: staged validation, смена каталога с rollback; это не filesystem-wide atomic swap. Работающий API будет обслуживать snapshot/CSV из памяти одного run. Чувствительность параметров ещё не выполнена.

Реальный run_id: `cccc360c4ef414ab213f6ca7094f68d889baba6a28fadbf15b4a93198fa6bc31`. Следующий этап: типизированный API, run.py и передача endpoints B.

## A3 API/CLI — 2026-09-23T14:51:09+05:00

Опубликован типизированный API v1 и run.py. 61 тест пройден, lint/compileall/pip check проходят. CLI pipeline-only 0.883114 s; verify-only valid. Реальный Uvicorn HTTP smoke выполнен; все ответы одного run_id. Реальные примеры в contracts/v1.actual.json. Ошибки 404/422 в согласованной оболочке; экспорт whitelist и CSV из того же memory snapshot. GET не пересчитывает аналитику.

B появился: 7266a72, принят контракт 6776169, основан на fd9c760. Прочитаны его domain.ts/api.ts/B.md; несовместимости полей не обнаружены. web не редактировался. Далее merge готового B1 и самостоятельная проверка его сборки; полная графовая UI-функциональность ещё разрабатывается B.

Обновлены README, THIRD_PARTY, validation и контракт передачи. Единственный warning — upstream deprecation Starlette TestClient/httpx, не ошибка runtime. Полный G3/G5/G6 пока не пройден.

## Интеграция B1 и ревью A0–A3 — 2026-09-23T15:03:58+05:00

B1 объединён коммитом 01f3216, npm ci/test/build выполнены на A (12 PASS, bundle совпал). В браузере проверены очередь и реальная карточка. После fetch обнаружены B2 e63e343 и изменение заголовка README в main e5f2b4e; они будут объединены с сохранением истории. web не изменялся A.

Отдельный read-only reviewer обнаружил P1: CSV мог читаться из каталога другого run при запуске API; исправлено кодированием CSV непосредственно из обслуживаемого snapshot. P2: verify-only не сверял отдельные переводы/рёбра; теперь сверяет точные строки и исходные факты узлов. P2: двойной отказ публикации и rollback мог удалить backup; прежний результат теперь сохраняется вне временного каталога с путём в сообщении. Добавлены 17 регрессионных проверок, включая 422 для отрицательного cluster_id. После исправлений: 78 passed, 1 upstream warning; ruff проходит.

Восемь sensitivity-вариантов фактически рассчитаны: top-20 membership 20/20 во всех, роли меняются у 0–112 узлов (0–4.98%), кластеры 83–98. Дефолтная конфигурация не менялась; evidence в docs/hackalem/evidence/a2-sensitivity.json. Независимая сверка raw reviewer-ом не нашла ошибок денежных агрегатов, полного множества узлов, seed reach или source refs.

Не объявляются готовыми: полный G3, второй ноутбук/clean clone, offline runtime, демо/подача. E1/E2/LLM выключены. Продолжение — B2 integration и реальный UI/API smoke.
