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

## G3 совместный сценарий — 2026-09-23T15:13:28+05:00

B2 и B3 объединены с сохранением истории; текущий commit cd94bfbb9c8f06d31534d3a82ab6e72a9c56a6a4. На A 78 backend / 18 frontend unit / 12 contract E2E / 3 real integration PASS, build воспроизводится. Поиск любого gid, boundary/isolate, направленный граф, альтернативы, исходные переводы, кластер и три скачивания проверены. Fresh clone A + новый venv дали 4.93236 s raw→CSV. OS network sandbox запрещает внешние соединения сервера и браузера; 3 integration PASS. Подробности/ошибка Node26 installer/артефакты в validation и evidence/g3-a.

G3 функционально PASS; G5 пока частичный: настоящий новый clone на втором ноутбуке, архитектура/демо ещё ожидаются от B. Открытых P0/P1 по выполненным сценариям нет. До дедлайна более 160 минут; разрешён плановый E1 (не более 20 минут), API-контракт публикуется заранее, существующие поля не переименовываются. E2/LLM в сокращённый маршрут не добавляются.

## A4 — E1 backend — 2026-09-23T15:20:11+05:00

После зелёного G3 и при запасе >160 минут реализован плановый read-only POST /api/v1/experiments/removal. Контракт опубликован заранее ae48cab; все прежние GET-поля сохранены. Правильная baseline по оставшимся узлам, weak components, null при нулевом знаменателе, directed removed-edge count, ограниченный LRU 128 на run_id/sorted gid. Повторные/неверные/неизвестные gid дают 422/404.

TDD: новый tests/test_experiments.py сначала падал на отсутствующем app.experiments; после реализации 16/16 PASS. Весь backend 94 PASS, lint/compileall/verify-only проходят; raw→CSV 0.997124 s, три CSV побайтово не изменились. Реальный HTTP: 3 выбранных узла, 2245 оставшихся, 152 рёбра удалены, 1791630→1616490 связанных пар, 9.976 ms, CSV до/после равны. Это не оценка предотвращённых денег.

Независимый read-only reviewer дополнительно исчерпывающе проверил 448 удалений на всех 64 directed графах из трёх вершин; математика, края, immutable snapshot и cache eviction 128 совпали. Конкретных P0/P1/P2 не обнаружено. UI остаётся зоной B; до его проверки не объявлять E1 сквозной функцией. Реальный пример в contracts/v1.removal.actual.json.

Получен R1 отчёт Алишера 9c4d973: настоящий clean clone второго ноутбука, 78 backend / 18 frontend / 12 contract / 3 real integration PASS с OS-изоляцией сети. Следующий шаг: интегрировать его docs/architecture.md и docs/demo.md, обновить финальный README, ждать готовую E1 панель в пределах 20 минут.

## Заключительная приёмка и передача — 2026-09-23T15:28:38+05:00

Main включает обязательный MVP, E1 API, B R1/R2 и исправленный README. Полный новый clone main dc99cf2: locks install, первый pipeline 5.273589 s, verify-only, 94 tests, lint/compileall/pip check PASS. 3 настоящих browser integration под OS network sandbox PASS (4.2 s), E1 POST=200, CSV неизменны. Source code/locks после этого не менялись; 398b4b4 исправил только две устаревшие документационные фразы. 31 README local link проверен read-only reviewer-ом, P0/P1 нет.

Техническое демо B 141.218 s (без человеческой речи) и повторный clean README test B включены. Доступная интеграция B принята полностью; её web-код A не редактировал. Optional E1 UI не подключён, E2/LLM не включены. Подача капитаном ещё не подтверждена. Монитор origin/main/workspace-ui остаётся до 18:00 и сообщает только о значимых новых изменениях/конфликтах.
