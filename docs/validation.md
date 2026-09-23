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

## E1 backend — 2026-09-23T15:20:11+05:00

16 новых meaningful tests: цепь, треугольник, встречные рёбра, пустой остаток/нулевой знаменатель, полностью удалённая компонента, независимое перечисление путей, exact gid, immutable CSV/snapshot, ошибки тела запроса. Весь backend: 94 PASS. Дополнительный read-only review независимо проверил 448 вариантов удаления во всех 64 трёхвершинных directed графах и bounded LRU eviction. P0/P1/P2 не найдены.

Реальный HTTP smoke: 9.976 ms; 2245 оставшихся узлов, 152 removed edges, 1791630→1616490 connected pairs. Запрос/ответ в contracts/v1.removal.actual.json; evidence в docs/hackalem/evidence/e1-api.json. Три CSV неизменны. E1 UI пока не проверен и не объявляется реализованным.

## R1 второго ноутбука и исправления README — 2026-09-23T15:22:07+05:00

В 6507384 объединён отчёт B 9c4d973 и его архитектура/демо. Самостоятельный fresh SSH clone на Apple M2 / 8 CPU / 8 GiB / macOS 27.0, без копирования .venv/.env/node_modules: Python 78 PASS, frontend 18 PASS, contract E2E 12 PASS, real integration 3 PASS. OS запрещала внешнюю сеть серверу/Chromium; контроль EPERM/ERR_ACCESS_DENIED, localhost=200. Полный offline pipeline 0.901199 s, CSV/API/files совпали. Evidence: web/evidence/r1/clean-launch.json и network-proof.json. Это проверка B, подтверждённая его опубликованными командами и артефактами, не повторный замер на A.

Замечания буквального README устранены: HTTPS/SSH варианты, интегрированная ветка, отдельная установка браузера, работающий web/dist. На A отдельный clone с Node 24.19.0 выполнил npm ci → 18 unit PASS → build; dist побайтово совпал. Архитектурная схема и демо-сценарий включены. G5 для обязательного MVP выполнен в этих пределах; E1 пока прошёл только backend-проверку.

## Остаётся до релиза

Принять optional E1 UI если успевает и повторить его сквозную проверку; зафиксировать окончательный SHA и подтверждение подачи. Устное демо человеком не измерено. E2/LLM не включены. G6 не заявляется.

## Заключительная проверка main на A — 2026-09-23T15:28:38+05:00

Новый clone **main dc99cf2857091c5e8086117f7ddd8be744e3e0fa**, отдельный venv, установка runtime/dev locks. Первый pipeline 5.273589 s; verify-only valid; 94 pytest PASS (1 известный warning), ruff/compileall/pip check PASS. Python run.py обслужил включённый web/dist без установки Node/npm в этот clone.

Сервер и Chromium test process запущены под опубликованным B профилем web/scripts/offline-macos.sb: все 3 настоящих integration tests PASS за 4.2 s, три downloads совпали с API/файлами. E1 meta=true и реальный POST=200 также проверены на этом isolated server. После dc99cf2 до этой записи менялась только документация; приложение и locks не менялись. Evidence: docs/hackalem/evidence/release-a/.

Финальный read-only README-review проверил команды/флаги/версии и 31 локальную Markdown-ссылку: битых ссылок и P0/P1 нет. Две устаревшие фразы про ожидающийся второй clone/R1 integration исправлены в 398b4b4. Скан tracked-files по сигнатурам private keys/GitHub/OpenAI tokens и личным окружениям не дал находок (это ограниченный scan, не гарантия отсутствия любого секрета).

## Усиленное независимое ревью — 2026-09-23T15:49:59+05:00

Astra 6 Ultra обнаружила и воспроизвела ошибки только за пределами официального набора/default config: потерю тиынов при больших float/int суммах (P1 по рубрике проекта), обход score caps периферийной ролью (P1), отрицательные priority weights и caps вне диапазона, способные публиковать результат, не принимаемый API (P2). Исправлены точное масштабирование целых, Decimal для дробной десятичной записи, применение peripheral caps, диапазон/длины весов и диапазон caps. Перед заменой результата теперь проверяются полные Pydantic-контракты NodeDetail/ClusterDetail/Transfer.

Девять новых проверок и два дополнительных сценария staging: всего **105 tests PASS**, lint PASS. Воспроизведения сначала действительно падали. Учтён отдельный край scientific notation: exact float 90000000000000016 не превращается в 90000000000000020. Недопустимый результат не заменяет предыдущий каталог. Версия алгоритма 1.0.1, run_id `c4894b7dbe3a21e042250ec621491f817f1fb61db1ece87c1771ee668786795d`. Pipeline 1.193834 s; verify-only valid; все три CSV официального набора побайтово прежние.

Дополнительный runtime probe до этих изменений: 228 HTTP-запросов, 38 выбранных узлов, serial/4 concurrent. p95 card 1.990/4.962 ms; ego1 2.757/5.409 ms; ego2 3.926/82.982 ms. Один run_id, корни/рёбра согласованы, CSV до/после равны. Это HTTP loopback на машине A, не browser click-to-paint/SLA. Скрипт и полные samples: evidence/runtime-a.

Пользователь подтвердил: E1 UI делает Алишер; web A не правит. Новый B4 153adaf проверен read-only, интеграция после фиксации backend. Пользователь предоставил локальный OpenAI API для F13; исходный сокращённый маршрут расширяется по явному запросу при сохранении обязательного offline workflow. Ключ исключён из Git, F13 пока не реализован/не включён.

## Интеграция B4 — 2026-09-23T15:52:37+05:00

Алишер 153adaf объединён с сохранением истории. Два read-only прохода не обнаружили P0/P1. На A после merge реально пройдены 18 unit, production build (bundle совпадает), 13 contract E2E (8.9 s), 3 real API/browser/CSV integration (4.7 s) на backend 1.0.1. Сервер пересчитал raw за 0.966685 s. E1 UI ещё делает B; файлы web A вручную не правил. Опубликован отдельный контракт agent-v1.md до реализации F13. Доступ локального ключа к gpt-5.4-mini-2026-03-17 подтверждён GET модели, генераций пока 0.

## F13 — настоящий ограниченный агент — 2026-09-23T16:09:50+05:00

По явному продолжению пользователя и после предоставления локального OpenAI API реализован агент через Responses, gpt-5.4-mini-2026-03-17. Стабильный контракт agent-v1.md опубликован adee8aa до кода. Модель выбирает проверенные read-only инструменты и statement IDs; сервер рендерит только полученные факты, связывает answered с выбранным gid и требует ограничения. Runtime activation только --assistant/--ask, default workflow не читает .env. Секрет не включён в репозиторий. Никакой UI агента пока нет.

Независимый Astra 6 Ultra review обнаружил и закрыл обработку malformed provider payload, недостаточную привязку ответа к выбранному узлу и отсутствующие usage counters. Добавлены соответствующие регрессии, защита origin и tests HTTP timeout/redaction. **130 backend tests PASS (25 F13), ruff/compileall PASS**. Review не нашёл оставшихся P0/P1/P2 в рассмотренном scope.

Четыре настоящих вопроса, **12 Responses-вызовов, 30805 input / 1024 output tokens** по ответам провайдера; фактическое списание не читалось. Первый цикл 8.379 s; HTTP node 11.063 s с actual source_ref и альтернативой; провокационный boundary 8.331 s → insufficient_data (не доказывает личность/виновность/полный баланс); CLI изолята выдаёт один JSON в stdout. Роли/CSV/snapshot неизменны. Это проверка четырёх сценариев, не benchmark accuracy. Evidence и source hashes: docs/hackalem/evidence/f13-a.

После F13 сервер и Chromium реально запущены с запретом внешней сети: основной pipeline 0.936258 s, **3 real integration PASS (4.8 s)**, три CSV совпадают. Наличие локального ключа не включает агента автоматически. Последние frontend checks: B4 18 unit /13 contract/3 real PASS; новый агент web не изменяет. E1 UI остаётся у Алишера, последний полученный commit153adaf уже интегрирован. Сдача платформе не подтверждена.

## Новый clone после F13 — 2026-09-23T16:13:59+05:00

Из официального main a6a0116 создан новый neverlose-f13-clean без .env/node_modules/старой .venv. Новый venv, runtime lock install, pip check PASS, первый raw→CSV 5.489981 s, verify-only valid, три CSV имеют прежние hashes. Запущен обычный `python run.py --port 8006`: health/meta/local JS+CSS=200, features.agent=false, agent POST=503 AGENT_DISABLED. CLI --ask без ключа завершился кодом2 и понятным сообщением без traceback. Это новая проверка на машине A, не третий ноутбук. Временные серверы остановлены; пользовательский 8000 запущен с --assistant, out work/live-results, ключ не печатается.

## Интеграция B5 — 2026-09-23T16:28:54+05:00

Проверенный код `50bf33aab18a35c15927adb94eae9058712da615`, прямой потомок main `57a9ccf`. B завершил темы и возврат к обзору; A получил целиком его commit fast-forward, web source не правил. Отдельный Astra 6 Ultra read-only review проверил смену темы, сохранение Cytoscape/точных gid/денег, cancel late requests при возврате и неизменность API/архитектуры: конкретных P0/P1/P2 не найдено.

Фактические проверки на A: 19 frontend unit PASS; build PASS, dist совпадает с B; 34 contract E2E PASS (22.3s, обе темы). 3 real integration PASS (8.4s), включая обе темы × три размера, поиск/граф/карточку/переводы/возврат, boundary/isolate/cluster и browser download/API/disk равенство трёх CSV. Сервер и Chromium отдельно ограничены `sandbox-exec -f web/scripts/offline-macos.sb`; обычный offline запуск, без агента. Pipeline0.980855s, verify valid:2248/89/top50. Python130 PASS(5.93s) повторены непосредственно перед B5; Python/API в B5 не менялись. Просмотрены реальные screenshots, build не выдаётся за визуальную приёмку.

Evidence и команды: `docs/hackalem/evidence/b5-a/report.json`, run/download hashes и два новых screenshots. Обычное предупреждение Vite681.98KB и whitespace в generated Cytoscape shader остаются неблокирующими; source diff check PASS. Новых оплачиваемых OpenAI запросов0. E1/F13 UI, E2 отсутствуют; новый clone/устное демо/подача B5 не заявляются. Приёмка B5 PASS; окончательный G6 остаётся открытым.

## 2026-09-23T17:01:27+05:00 — панель AI, объяснимый top и легенда

База2e79ed4; код этого этапа в коммите с данным разделом. 133 Python PASS (5.23s), 31unit PASS, 50contract PASS(32.0s), 3real integration PASS(8.5s), build PASS. Обычный сервер и Chromium отдельно запущены через offline-macos.sb; проверены обе темы/триdesktopразмера/CSVbyteequality. Реальный raw pipeline1.601387s; verifyvalid2248/89/50. Полный ruff по репозиторию включает неизменённый starter и исторический probe с2I001; установленный scope `ruff check app tests run.py` проходит, оригинальный starter не правили. Compileall/pipcheck прошли.

Два настоящих browser→API→OpenAI вопроса: 5modelcalls,12168input/539output. Последний вопрос на1.0.2 вызвал prepare_brief/get_transfers, вернул16цитат/source_ref, ссылкиHTTP200; Markdown реально скачан, CSVдо/послеравны. Отдельно mocks проверяют гонки/отказы, они не считаются live. Независимые read-only reviews P0/P1 не нашли. Замечание о Markdown-переносах снято прямой проверкой сохранённых байтов; последующая легенда/нижняя полоса исправили реальное перекрытие кнопкой ссылки карточки. [Report](hackalem/evidence/agent-ui-a/report.json).

Claude-ревью, переданное пользователем, проверено: почемуtop написано понятно; версии/run_id обновлены; все применимые флаги сохраняются; 41/50out>in подтверждено; 19кластеров-изолятов имеют отдельное описание, остальные70—консервативный общий шаблон. Linux-прогон из текста не засчитан независимым evidence без логов. Проценты победы не подтверждаем.
