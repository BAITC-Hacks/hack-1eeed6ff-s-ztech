# Фактическая проверка Neverlose

## Backend A0–A3, 23 сентября 2026

Среда: macOS 26.6.2 (25G83), arm64, Apple M4, 16 GiB; Python 3.12.14. Runtime/development пакеты зафиксированы lock-файлами. Не заявляется проверка Windows/Linux или модели 4 CPU / 8 GB.

| Проверка | Результат |
|---|---|
| Оригинальные source manifest SHA-256 | Все совпали |
| `python -m pip check` | No broken requirements found |
| `python -m pytest tests -q` | 78 passed; 1 upstream warning Starlette о будущем переходе TestClient с httpx на httpx2 |
| `ruff check app tests run.py` | All checks passed |
| `python -m compileall -q app run.py` | Exit 0 |
| `python run.py --pipeline-only` | Exit 0; pipeline wall 0.883114 s |
| `python run.py --verify-only` | status=valid; 2248 nodes, 89 clusters, 50 top |
| Реальный Uvicorn `python run.py --api-only` | /health ready; meta/card/transfers/graph/cluster имеют один run_id |
| HTTP smoke карточка / ego | 2.398 / 2.185 ms; единичный локальный замер |
| CSV повтор / перестановка raw | Побайтовое равенство трёх CSV в тестах |

Проверены D01–D09, A01–A12, E01–E06, I01–I05 из матрицы. Отдельные числа performance не являются SLA или проверкой иной машины.

Результат v1: run_id `cccc360c4ef414ab213f6ca7094f68d889baba6a28fadbf15b4a93198fa6bc31`; оборот 365890012.01 KZT; 2248 nodes, 3119 edges, 4840 tx, 81 seed, 19 isolates, 444 boundary, 89 clusters, 50 top. 97 повторных tx сохранены. Все boundary не terminal. Нет ground truth — accuracy не вычислялась.

Ручной смысловой просмотр по одному реальному представителю каждой выданной роли: consolidator 100000008346837100 (a=9,b=25), distributor 100000008710791100 (b=23), coordinator 100000005527892100 (a=3,b=8,s=4, cap=.55), transit 100000003635170100 (268500→253500 KZT), terminal 100000001282143100 (a=5,b=0, cap=.65), peripheral 100000003809101100 (a=2,b=2, ratio вне транзитного диапазона). Это примеры проверки, не списки алгоритмических ответов.

Алишер: ветка `codex/workspace-ui`, B1 `7266a72`, контракт A принят; B1 объединён коммитом `01f3216`. На машине A фактически выполнены `npm ci`, `npm test -- --run` (12 PASS), `npm run build` (PASS). Bundle совпал, изменений web от A нет. В браузере открыт настоящий сервер: очередь, поиск и карточка показывают данные backend. Полная графовая интеграция пока ожидается; новый B2 `e63e343` обнаружен при fetch 15:02 Астана.

## Проверка ревью и чувствительности, 15:03 Астана

Независимый read-only review проверил соответствие 2248 узлов, 4840 переводов, 3119 рёбер и 89 кластеров исходным данным. Найдены и исправлены: CSV другого запуска при одновременной смене каталога результатов (P1); недостаточная построчная проверка snapshot (P2); потеря предыдущего результата при двойном отказе публикации/rollback (P2). Добавлены регрессионные тесты с подменённым snapshot и отказами файловой системы. API формирует CSV непосредственно из обслуживаемого snapshot; проверка результата сопоставляет каждую исходную строку, ребро, степени, количество переводов, флаги и суммы; при неуспешном rollback прежний результат сохраняется в явно указанном recovery-каталоге. Некорректный отрицательный cluster_id возвращает 422. После исправлений — 78 PASS.

Восемь отдельных изменений порогов проверены без подбора параметров под ответ. Состав top-20 сохранился 20/20 во всех вариантах; число изменившихся ролей 0–112 (0–4.98%). Louvain resolution 0.8/1.2 даёт 83/98 кластеров вместо 89. Это диагностика устойчивости, не доказательство правильности гипотез. Конфигурация по умолчанию сохранена; результаты — `docs/hackalem/evidence/a2-sensitivity.json`.

## Совместный G3 — 2026-09-23T15:13:28+05:00

Интегрированный commit `cd94bfbb9c8f06d31534d3a82ab6e72a9c56a6a4` содержит B3 (3ac6bea), B2, backend review fixes и изменение заголовка из main. web source не редактировался A. На A: 18 unit PASS, production build PASS; 12 contract E2E PASS (10.2 s); 3 integration E2E PASS (7.2 s). Последние обращаются к настоящему серверу из нового GitHub clone, выбирают gid из данных, проверяют 1440×900/1280×800/1024×768, boundary, isolate, totals, cluster и побайтовое равенство трёх CSV. G3 функционально PASS; окончательный G5/G6 отдельно.

Fresh clone A: независимый каталог, новый venv из установленного CPython 3.12.14, установка только requirements.lock; pip check PASS; pipeline 4.93236 s, verify-only valid, после установки dev lock 78 tests PASS и lint PASS. .venv/.env и результаты не копировались из рабочего checkout. Это та же машина A, не подмена требования второго ноутбука.

Offline-runtime: macOS sandbox-exec с `(deny network-outbound)` и исключением только loopback применён и к Python server, и к Node/Chromium integration процессу. Контрольное внешнее соединение вызвало PermissionError. Все 3 integration сценария проходят с этой политикой, включая CSV downloads. Сеть всего ноутбука не отключалась. Скрипты/стили/шрифты локальные; внешних URL/imports в web/src/index.html не обнаружено. Артефакты A: `docs/hackalem/evidence/g3-a/`.

Сбой окружения: первоначальные 9 E2E не стартовали из-за отсутствующего Chromium. Загрузка под Node 26.9.0 завершилась, распаковка зависла; процесс остановлен. Под Node 24.19.0 установлен Chromium Headless Shell 140.0.7339.186 и FFMPEG в отдельный work/pw-browsers; 12+3 теста затем прошли. Это не исправление приложения. Команды тестов: `node node_modules/playwright/cli.js test` и `node node_modules/playwright/cli.js test --config playwright.integration.config.ts`; заданы только PLAYWRIGHT_BROWSERS_PATH, NEVERLOSE_BASE_URL и NEVERLOSE_RESULTS для данного стенда.

## Остаётся до релиза

Релизный clean clone на втором ноутбуке, финальная документация архитектуры/демо Алишера, репетиция, окончательный SHA и подтверждение подачи. E1/E2/LLM сейчас не включены. G6 не заявляется.
