# Независимая проверка README: новый clone

Дата: 23 сентября 2026, 17:07–17:12, Asia/Almaty (UTC+5).

Проверен официальный репозиторий `BAITC-Hacks/hack-1eeed6ff-s-ztech`, полный SHA `f45632fdab6af0c5eb368a6fc537ce70cdff5622` (main). Исходники заново получены по SSH. Сначала clone был на codex/workspace-ui, затем до создания окружения переключён на свежий main по уточнению ответственного проверяющего. Каталог: `/Users/mrxfsociety/Documents/Codex/2026-09-23/new-chat/work/audit-clean-1707`.

## Результат

Основной запуск README, проверка результата и HTTP-сценарий работают без ключей/подписок при запрете внешней сети. Ошибок инструкций запуска не обнаружено. Никакие исходники и инструкции для прохождения проверки не исправлялись. Повтор после исправления не требовался.

- `pip install -r requirements.lock`: успешно, новое окружение `.venv`, системные site-packages выключены.
- `pip check`: `No broken requirements found`.
- `run.py --port 8002`: `status=ready`; время pipeline по сообщению процесса 4.452316 с.
- `run.py --verify-only`: `status=valid`, 2248 nodes / 89 clusters / 50 top_nodes, тот же run_id.
- `/health`, `/api/v1/meta`, корневая HTML и оба JS/CSS asset: доступны с HTTP 200.
- Метаданные: 2248 узлов / 3119 связей / 4840 переводов / 81 seed / 19 isolates / 444 boundary / 89 clusters. Сумма `365890012.01 KZT`, период 2026-07-01…2026-07-31.
- Граф обзора: 89 кластеров / 210 направленных межкластерных связей, не обрезан.
- README gid `100000008346837100`: consolidator, cluster13, вход `254359.00`, выход `1258643.00`; альтернатива distributor. Исходящие source_ref и итог переводов совпадают с карточкой.
- README boundary `100000001053894100`: boundary/peripheral. Isolate `100000000456947100`: seed/peripheral, нулевые score, ego 1 узел / 0 связей.
- Точная команда случайного gid из README выполнена. Выбран `100000005961971100`; API вернул его без изменения цифр, role terminal.
- Несуществующий gid `999999999999999999`: настоящий HTTP404 / NODE_NOT_FOUND.
- Все три CSV скачаны по HTTP; заголовки Content-Disposition attachment и X-Run-Id корректны, байты полностью совпадают с файлами нового расчёта. Строк данных: 2248 / 89 / 50.
- `features.agent=false`: отсутствие API-ключа честно отражено в контракте; основной сценарий работает.

Run ID: `d194e7cad44fdc0265a5d8f2eeeb9ab7a4a16a88a98e3eeecd164ad01a4658d3`. Версия алгоритма `1.0.2`.

## Независимость установки

macOS 27.0 (26A428), arm64, Apple M2, 8 CPU, 8 GiB RAM. Python 3.12.14, pip 25.0.1. Все версии установленных Python-пакетов зафиксированы в `packages.json`. Node.js/npm для обычного запуска не использовались.

В shell отсутствовала команда `python3.12` в PATH; `python3` указывал на установленный Python 3.14. Это заранее обозначенная README предпосылка, не дефект приложения. В PATH добавлен существующий отдельно установленный CPython3.12.14: `/Users/mrxfsociety/Documents/Codex/2026-09-23/new-chat/work/python/cpython-3.12.14-macos-aarch64-none/bin`. Из него создана совершенно новая `.venv`. Чужая `.venv`, `.env`, файлы результатов и зависимости из другого clone не копировались. Пакеты установлены штатной командой pip из lock: часть wheel pip использовал из своего download cache, остальные скачал; runtime-зависимости из другого окружения не подключались.

Использован Git Command Line Tools `/Library/Developer/CommandLineTools/usr/bin/git`, поскольку стандартный Git на этом Mac ранее требовал принятия лицензии Xcode. Это особенность машины, не условие приложения. SSH — явно документированная альтернатива HTTPS. Нужен доступ к приватному репозиторию для получения исходников; ключ GitHub не передаётся приложению.

Свободный порт 8002 выбран тем же документированным `--port`, поскольку основной проверяемый сайт родителя использует 8000. Каталог `results/` остался стандартным внутри нового clone. После run.py изменились только генерируемые `results/manifest.json` и `results/snapshot.json` (время/окружение); исходники не менялись, CSV воспроизвелись побайтово.

## Фактически выполненные команды

```sh
/Library/Developer/CommandLineTools/usr/bin/git clone --branch codex/workspace-ui git@github.com:BAITC-Hacks/hack-1eeed6ff-s-ztech.git audit-clean-1707
cd audit-clean-1707
/Library/Developer/CommandLineTools/usr/bin/git checkout main
/Library/Developer/CommandLineTools/usr/bin/git rev-parse HEAD
PATH=/Users/mrxfsociety/Documents/Codex/2026-09-23/new-chat/work/python/cpython-3.12.14-macos-aarch64-none/bin:$PATH python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip check
env -i PATH=/usr/bin:/bin LANG=en_US.UTF-8 /usr/bin/sandbox-exec -f web/scripts/offline-macos.sb .venv/bin/python run.py --port 8002
env -i PATH=/usr/bin:/bin LANG=en_US.UTF-8 /usr/bin/sandbox-exec -f web/scripts/offline-macos.sb .venv/bin/python run.py --verify-only
env -i PATH=/usr/bin:/bin LANG=en_US.UTF-8 /usr/bin/sandbox-exec -f web/scripts/offline-macos.sb .venv/bin/python work/audit-evidence/check.py
env -i PATH=/usr/bin:/bin LANG=en_US.UTF-8 /usr/bin/sandbox-exec -f web/scripts/offline-macos.sb .venv/bin/python -c 'import secrets, pyarrow.parquet as pq; print(secrets.choice(pq.read_table("data/nodes.parquet", columns=["gid"]).column("gid").to_pylist()))'
```

## Offline и границы проверки

Для сервера и HTTP-проверяющего процесса применён включённый в репозиторий профиль sandbox-exec: deny network, разрешён только localhost. Проверяющий процесс фактически попытался открыть TCP к `1.1.1.1:443` и получил `[Errno 1] Operation not permitted`, затем успешно выполнил локальные HTTP-запросы. Сервер и проверка запускаются с `env -i`; в проверяющем процессе остались только `PATH`, `LANG` и автоматически добавленный macOS `__CF_USER_TEXT_ENCODING`. `.env` не создавался. Это проверка сетевой изоляции процессов, а не отключение сети всего ноутбука.

Этот отдельный аудит подтверждает новый clone, установку, вычисления и HTTP/UI-asset/API/CSV-готовность. Нажатия в настоящем браузере, проверка загрузки CSV браузером, доступность и визуальная оценка в этом clone не выполнялись; их проверяет основной агент отдельно. Windows/Linux, target4CPU, миллионы узлов и реальный вызов необязательного AI-провайдера не проверялись. Демо человека с таймером здесь не проводилось.

Промежуточные ошибки инструмента не были ошибками продукта: одна shell-команда с неэкранированным `?` прервана zsh до HTTP, и первый вспомогательный check.py использовал ошибочное имя total_kzt вместо контрактного sum_kzt; после сверки схемы script исправлен, полный HTTP-check повторён и прошёл. Эти пробы не учитываются как успешные.

## Evidence

`server.log`, `verify.json`, `http-report.json`, `packages.json`, `random-gid.txt`, `random-node.json`, три скачанных CSV, вспомогательный `check.py` находятся рядом с этим отчётом. HTTP-report содержит SHA256/размеры CSV, URL/размеры assets, counts и факт EPERM. Сервер проверки: PID98912, порт8002 (предназначен только для этого аудита).
