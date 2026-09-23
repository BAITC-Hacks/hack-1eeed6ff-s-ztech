# Журнал Алишера / UI

## B0/B1 — 23.09.2026, 14:17–14:40 Астана (UTC+5)

Ветка: `codex/workspace-ui`, официальный remote `BAITC-Hacks/hack-1eeed6ff-s-ztech`.
Начальный main: `26dfda5f6254a1069cecb0d03e8d554b09e7293a`.
Принят опубликованный A контракт/fixture из `6776169`; checkout основан на backend
`fd9c760f4ce223ddb745e4d2dcaca4745d935cac`. Последний fetch перед проверкой не изменил эти refs.
Commit этапа определяется коммитом, добавляющим эту запись; точный SHA фиксируется следующим этапом.

### Реализовано

React/TS/Vite каркас с очередью, точным поиском gid, карточкой, boundary/isolate,
тремя desktop-компоновками. Все gid остаются строками, деньги форматируются строковыми операциями.
Runtime-валидация NodePage/NodeDetail/GraphResponse, отмена и версия запросов,
очистка данных при смене run_id. API error/unknown gid/empty/retry реализованы.
Тестовый контракт заметно обозначен; fixture отсутствует в production bundle.
Граф/переводы/экспорт пока не реализованы, реальный backend пока не запущен.

### Фактически выполнено

- Среда: macOS 27.0 (26A428), arm64; Node 25.2.1; npm 11.6.2;
  Git 2.50.1 (Apple Git-155) через `/Library/Developer/CommandLineTools/usr/bin/git`.
- Обычный `/usr/bin/git` блокировался лицензией Xcode; отдельный Git CommandLineTools работает.
- До настройки SSH обычный clone не авторизовывался. После настройки пользователем:
  настоящий SSH clone официального remote, без копирования секретов/окружения другой машины.
- `npm test -- --run`: 12/12 PASS, включая реальный parser длинных соседних gid,
  денежные строки, ограничения int64, directed endpoints, missing root,
  несовпадение gid/run_id, late-response, HTTP/network/JSON errors.
- `npm run build`: PASS, TypeScript + Vite 7.3.6. Bundle не содержит synthetic gid/данных.
- `npm run test:e2e` в Chromium 140.0.7339.186: 7 сценариев;
  1440×900, 1280×800, 1024×768, Enter/Escape/focus, точное clipboard-копирование двух gid,
  синхронизация очередь/карточка, empty/filter-independent search, unknown/isolate, error/retry, A→B.
- Проверены screenshots B1 на 1440 и 1024; без наложений и горизонтального скролла страницы.
- Начальный npm audit обнаружил Vite/Vitest advisories. Обновлены до 7.3.6/4.1.11:
  установка завершилась с `found 0 vulnerabilities`.

### Отдельный review и исправления

Проход по контракту, diff и состояниям: backend-поля не вычисляются на клиенте;
transport mock только в тестах. Найдено: имя select включало option-текст, что ломало
точный доступный поиск по label. Исправлено явным aria-label; повторены build и E2E.
Первый E2E запуск на Node 25 не загрузил JSON без import attribute; тестовый helper
переведён на `readFileSync`, production-код не затронут. Нет известных P0/P1 внутри B1.

### Ограничения / следующий этап

B1 проверяет только UI по опубликованному synthetic контракту. Это не готовый продукт.
G2/G3/R1/R2 не пройдены: ожидаются backend API/CSV/run.py и полная интеграция.
Следующий этап B2: Cytoscape, направления/лимит/root, карточка правил/альтернатив, teardown.

## B2 — 23.09.2026, 14:40–14:46 Астана

B1 опубликован: `7266a72`. Перед B2 выполнен fetch: main `26dfda5`, backend теперь
`7949dc0310669d30b310e3114218ac5e6bfc6acc` (расчёт/CSV; API ещё не опубликован).
Опубликованные оболочки и дополнения NodeDetail приняты без переименований.

Реализовано: обзор кластеров / cluster / ego (1–2 шага), направленные стрелки,
точные endpoint IDs, роли/seed/boundary, общий выбор queue/graph/card, кнопки масштаба,
доступные таблицы узлов/рёбер, counts и предупреждение о лимите. Карточка отображает
реальные поля raw/capped score, rule checks, вклад в приоритет, score caps,
alternative либо честное отсутствие альтернативы. Аналитика не пересчитывается в JS.
Подписки и ResizeObserver снимаются, Cytoscape уничтожается при unmount.

Проверки: `npm test -- --run` → 14 PASS; `npm run build` → PASS.
Полный `npm run test:e2e` → 8 PASS на production bundle; после добавления проверки
canvas-клика и truncated графа затронутый запуск `--grep 'directed graph table|truncation'`
→ 2 PASS (всего 9 разных сценариев). Проверены настоящая стрелка A→B, клик по canvas,
выбор из таблицы, повторный выбор того же gid, boundary, isolate (1 узел / 0 рёбер),
правдивые «2 из 300», три размера и предыдущие сценарии B1.
Screenshots: `web/evidence/b2/`. Проверка очистки — unit с реальным Cytoscape:
после dispose `destroyed()=true`, повторный tap не вызывает callback.

Отдельный review: P1 повторный выбор того же gid мог очищать граф без нового запроса;
исправлен счётчик повторной загрузки, браузерный регрессионный сценарий прошёл.
TypeScript выявил отсутствующий в typings метод headless(); проверка заменена
поддерживаемым container(). На visual review auto-fit увеличивал маленький граф
слишком сильно; начальный масштаб ограничен, повторная браузерная проверка прошла.
Bundle 660 KB minified / 212 KB gzip, предупреждение Vite о размере зафиксировано;
это локальная сборка, оптимизация размера не блокирует основной сценарий.

Статус B2: UI-контракт проверен, известных P0/P1 в объёме этапа нет.
Настоящий API/UI/CSV пока НЕ проверен. Следующий B3: meta, transfers, clusters,
download с проверкой X-Run-Id, интеграция с опубликованным API.

## B3 — 23.09.2026, 14:46–14:59 Астана

B2 commit `d09131b`; опубликован вместе с merge backend в `e63e343`.
Интеграция проверена на backend `01f3216d7871fe37ff362b91329f3e1b74b0e3fb`
(API реализация `6284c2c`), main на последнем fetch `e5f2b4e87127fba734a5a09220010539e0a36060`.
Backend импортирован merge-коммитом `01972337832b0e0a81dd4c5ce989a8ce90fe0455` без правки его кода.

Реализованы meta/counts/period/limitations, фильтры кластеров и карточка кластера,
переводы all/in/out с пагинацией и source_ref/физической строкой, ссылки из сумм карточки,
три CSV-download с проверкой Content-Type/attachment/X-Run-Id. При изменении snapshot
все старые панели очищаются. Выбранный gid вне текущей страницы явно закрепляется
в очереди без выдуманного глобального ранга. Никакого production fixture/fallback,
агентского чата или анимации анализа нет. Agent/removal/temporal в реальном meta выключены.

Фактические команды и результаты:

- Независимо установлен CPython 3.12.14 в папку задачи через uv 0.12.18; новый `.venv`.
  `python -m pip install -r requirements-dev.lock` → PASS, `pip check` → No broken requirements.
- `.venv/bin/python -m pytest tests -q` → 61 PASS (один upstream Starlette/httpx deprecation warning).
- `.venv/bin/python run.py --out work/integration-results` → localhost:8000,
  полный pipeline 1.190291 с; 2248/3119/4840, 89 кластеров.
- `npm test -- --run` → 18 PASS. `npm run build` → PASS.
- `npm run test:e2e` → 12 PASS в настоящем Chromium: contract-only transport,
  весь набор B1/B2 плюс duplicate source rows, 52 записи / две страницы, итог всей выборки,
  работающие скачивания всех трёх файлов, export error/retry, invalidation при смене run.
- `npm run test:integration` → 3 PASS без mock/route-подмен: реальный сервер,
  1440×900 / 1280×800 / 1024×768, boundary/isolate, три произвольных gid из offset=537,
  соответствие входящих сумм NodeDetail↔Transfers, кластер и три настоящих скачивания.
  Каждый скачанный CSV побайтно совпал с API и опубликованным results-файлом.
- Реальный run_id: `cccc360c4ef414ab213f6ca7094f68d889baba6a28fadbf15b4a93198fa6bc31`.
  Screenshots и SHA-256 скачанных файлов: `web/evidence/b3/`.

Отдельный review обнаружил P1: на 1024×768 graph counts обрезались при одновременной
таблице переводов. Исправлено переключение «Граф / Переводы», на широком экране
доступен также режим «Вместе». Добавлена проверка видимости counts; повторены все
12 contract E2E и 3 реальных integration tests, все PASS. Повторный переход из
переводов к обзору сбрасывает режим; предотвращена пустая центральная панель.
Источник/направление/суммы не вычисляются на клиенте. `git diff --check` для исходников чист;
предупреждения whitespace в собранном Cytoscape shader-коде не относятся к исходникам UI.

Статус: B3 интегрирован и проверен; R1/R2 ещё впереди. Не заявляется полная релизная готовность.

### Передача Мейраму: конкретные README-правки после интеграции B3

1. Указать финальную ветку/commit: текущая инструкция `git switch codex/analysis-core`
   пока даёт только интегрированный B1, а не свежий UI. Не объявлять B3 готовым в этой ветке
   до merge. После интеграции заменить устаревшие статусы про отсутствующие graph/transfers.
2. Перед `npm run test:e2e` требуется `npx playwright install chromium` на новой машине.
   Сам `npm ci` браузер не скачивает. Для реального сервера добавлена команда
   `npm run test:integration` (сервер заранее запущен, default localhost:8000).
3. Предусмотреть SSH-вариант clone для пользователей с настроенным SSH, но без HTTPS
   credential helper. На этой машине HTTPS clone фактически отказал; SSH clone прошёл.
4. Не заявлять offline/чистый запуск/репетицию по B3. Эти проверки выполняются следующим этапом.

## R1 — независимый clean launch, 23.09.2026, 15:01–15:09 Астана

Проверен новый SSH clone официального remote в `work/readme-clean`. До установки в нём
не было `.venv`, `.env` и `web/node_modules`; ни окружение, ни файлы с машины Мейрама
не копировались. Пакеты установлены через pip/npm из lock, с допустимым installer cache;
Chromium скачан заново в отдельный каталог. Runtime не требует личных подписок/API-ключей.

Фактическая машина B: macOS 27.0 (26A428), arm64, Apple M2, 8 CPU, 8 GiB RAM.
Python 3.12.14, Node 25.2.1, npm 11.6.2, Git CommandLineTools 2.50.1,
Chromium 140.0.7339.186. CPython установлен независимо через uv; его bin явно добавлен
в PATH перед буквальной командой `python3.12 -m venv .venv`. Системный `/usr/bin/git`
требует принятия Xcode license, поэтому использован уже работающий CLT git. Это
предпосылки конкретной машины, а не скопированное окружение A.

### Буквальный README и точные ошибки

Проверен README на `01f3216`, затем получены исправления backend `3e8c09a8f169a407b5206f45fd9586055babb15a`.

1. `git clone https://github.com/BAITC-Hacks/hack-1eeed6ff-s-ztech.git` с отключённым
   интерактивным запросом credentials: exit 128, `fatal: could not read Username for
   'https://github.com': terminal prompts disabled`. SSH clone того же remote → PASS.
   SSH не авторизует HTTPS автоматически; инструкция должна предусматривать оба способа.
2. `git switch codex/analysis-core` первоначально дал B1. `npm ci`, 12 unit и build
   действительно прошли, но это ещё не полный интерфейс. После `git switch codex/workspace-ui`
   проверен B3 `3ac6bea`, затем опубликованный merge `95c817c0aaa15e2f10e89e2558306fdd4e9c5ef1`.
   Финальный README должен указывать интегрированную версию и актуальный статус.
3. После буквального `npm run test:e2e` все 7 тестов остановились до браузерных действий:
   `Executable doesn't exist ... chromium_headless_shell-1193/chrome-mac/headless_shell`.
   Добавленная команда `npx playwright install chromium` выполнена; повтор на полном B3
   → 12 PASS. Исправленная последовательность есть в `web/README.md`; root README принадлежит A.

Команды Python из README выполнены: установка `requirements.lock`, `pip check`,
pipeline-only, verify-only, api-only (порт 8001), затем полный `run.py` с готовым dist.
Режим api-only закономерно вернул 503 UI_NOT_BUILT на `/`; /health/API работали.
После установки `requirements-dev.lock`: pytest, ruff и compileall.

### Итог повторной проверки на свежем backend

На `95c817c` (backend `3e8c09a`, main `e5f2b4e87127fba734a5a09220010539e0a36060`):

- Python tests → **78 PASS**, ruff/compileall/pip check → PASS.
- `npm ci` → 0 vulnerabilities; **18 unit PASS**, build PASS, dist совпал с Git.
- После отдельной установки браузера **12 contract E2E PASS**.
- **3 real integration E2E PASS** в новом clone с сетью, запрещённой для backend,
  тестового процесса и дочернего Chromium. Повторены после свежего исправления CSV backend.
- Полный offline pipeline 0.901199 с; verify-only → valid.
- UI/API/CSV одного run_id; все три скачанных файла побайтно совпали с API и новым results.

Изоляция: `sandbox-exec` с deny network* и allow localhost. Проверочная внешняя TCP-связь
получила **EPERM**, переход Chromium на внешний IP — **ERR_ACCESS_DENIED**, localhost health — 200.
Приложение не запросило внешних ресурсов. Системный Wi-Fi не выключали; сеть отключена
для проверяемых процессов. Установка пакетов offline не заявляется.
Команды воспроизведения — `web/README.md`, профиль — `web/scripts/offline-macos.sb`.
Фактическая среда, run/counts, network proof и SHA-256 скачанных CSV — `web/evidence/r1/`.

### Отдельный review R1

В отдельном проходе сопоставлены команды README, owner-границы, API-оболочки, состояние
сессии/отмена запросов, CSV snapshot и production imports. Fixture импортируется только
тестами; в production есть лишь честная метка для явно синтетического run_id.
Приложение не включает декоративные градиенты; поддержка gradient внутри стороннего
Cytoscape bundle не означает её использования. P0/P1 в проверенном UI не обнаружены.
Read-only review backend на A нашёл и исправил CSV snapshot P1; исправление получено
из GitHub и повторно проверено на B. Отдельного второго AI-reviewer на B не запускали.

README замечания не скрыты: root README и main интегрирует Мейрам. Backend-изменения
для обязательного UI больше не нужны. Ограничения: Chrome/Chromium на этой macOS,
не Safari/Firefox/Windows/Linux, не million-scale; Vite предупреждает о chunk >500 KB.
Устное демо ещё не измерено. Подготовлены architecture.md и сценарий demo.md.

## R2 — техническая репетиция и передача, 23.09.2026, 15:09–15:15 Астана

R1 опубликован коммитом `9c4d973`; код приложения и backend проверены на `95c817c`.
docs/demo.md содержит последовательность проблема → живой результат → узел →
основания/переводы → альтернатива → boundary → произвольный gid → три CSV/ограничения.
Бюджет выступления 4:30. Живой pipeline на новом clone повторён за 1.207676 с.

Фактический таймер: 15:09:51.173–15:12:12.391 Астана, **141.218 с**. Все действия
выполнены в настоящем UI, без fixture. Произвольный gid `100000008769636100` выбран
через secrets.choice из исходного nodes.parquet и найден через активный boundary-фильтр.
Условия альтернативы (распределение, 25 получателей >=5) и source_ref строки 1417
действительно открыты. Это техническая репетиция без устного выступления человека.

Отдельный review репетиции: screenshot выявил, что для чтения 33-узлового графа удобнее
«Граф» вместо «Вместе»; действие включено в сценарий. Один координатный scroll средства
управления вышел за его viewport, переход выполнен через доступный заголовок. Это не
ошибка приложения. Download-event встроенного браузера не был подтверждён за 3 с:
сообщение UI не засчитано как сохранение. Затронутый тест фактического download в
Chromium повторён при запрете внешней сети → **1 PASS**, три файла сохранены и их
байты совпали с API/results. Этот повтор включён в 141.218 с. Evidence: `web/evidence/r2/`.

Документация проверена отдельным проходом на готовность функций, точность команд,
границы claims, реальные SHA и отсутствие выдуманного агента. Production код с B3
не менялся; 18 unit, build, 12 contract E2E и 3 offline integration остаются результатами
текущей сборки, после свежих backend-исправлений повторены 78 Python tests и real integration.
Проверки не объявлялись выполненными по одному build.

Передача A: интегрировать codex/workspace-ui с сохранением истории, перенести точные
README-замечания R1 в root README/validation, повторить затронутые инструкции и
зафиксировать SHA main/подачу. Обязательных изменений API для B нет. E1/E2/агент не
подключены и в демо отсутствуют. Устную репетицию команды, проверку других ОС/браузеров
и факт сдачи этот журнал не подтверждает.
