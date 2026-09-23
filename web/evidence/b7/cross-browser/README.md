# Дополнительная проверка движков, 23 сентября 2026

Проверяемая версия: `a8965b1` плюс локальное исправление порядка `AgentPanel.close()`. Успешный повтор обслуживал bundle `index-BNOlXt4X.js` (707.76 KB по build родителя). Эта проверка НЕ относится к последующему `main 1c40fa4` с common-recipient UI/API.

Среда: macOS 27.0 (26A428), Apple M2 arm64, Node25.2.1, Playwright1.55.1 из lock репозитория. Браузеры установлены официальной командой `node work/neverlose/web/node_modules/playwright/cli.js install firefox webkit` в отдельный `work/audit-browsers`. Дистрибутивы: Firefox141.0 build1490 и Playwright WebKit26.0 build2203 (mac-15-arm64). WebKit не называется настоящим Safari.

## WebKit

Штатный запуск подтвердил `browser.version() = 26.0`. Сервер родителя localhost8000 оставался под `offline-macos.sb`, тестовый процесс с браузером запускался под тем же профилем. Прямой внешний TCP к1.1.1.1:443 в процессе под профилем вернул `EPERM`; localhost доступен. `browser-versions.json` и `launch.log` сохраняют проверку.

Первый прогон: 4 PASS / 1 FAIL за26.6с. Дефект: после кнопки закрытия AI-диалога фокус не возвращался на trigger в WebKit. `trigger.focus()` выполнялся до фактического `dialog.close()`, пока фон был inert. Родитель изменил последовательность: сначала закрытие native dialog, затем setOpen(false), затем trigger.focus().

Повтор всех пяти реальных integration cases: **5 PASS**, 0failed/0skipped/0flaky, 66.665547с; 17:44:13–17:45:19 Asia/Almaty. Один worker, responses не подменялись, платные вызовы не выполнялись. Проверены обе темы и основной маршрут на1440×900,1280×800,1024×768; boundary/isolate/произвольныеgid; исходные переводы и реальная пагинация125строк; CSV UI↔API↔disk; обзор/сетка/разворот; контекстные средства управления и disabled AI. Конкретный состав — исходные5spec cases, не заявление о каждом возможном сочетании интерфейса.

Зелёный JSON: `report.json`; журнал: `webkit-after-fix.log`; screenshots/JSON/CSV: `test-results/`; HTML: `html-report/`. Полный первый неуспешный результат сохранён отдельно в `webkit-before-fix/`, включая report, log, trace.zip и failure screenshot. Он не заменён зелёным отчётом.

Команда повтора:

```sh
PLAYWRIGHT_BROWSERS_PATH=/Users/mrxfsociety/Documents/Codex/2026-09-23/new-chat/work/audit-browsers \
NEVERLOSE_RESULTS=/Users/mrxfsociety/Documents/Codex/2026-09-23/new-chat/work/neverlose/work/exchange-results \
/usr/bin/sandbox-exec -f work/neverlose/web/scripts/offline-macos.sb \
node work/neverlose/web/node_modules/playwright/cli.js test --config work/audit-crossbrowser.config.mjs --project webkit
```

## Firefox: среда не дала выполнить приложение

Под внешним offline sandbox штатный Firefox не завершил launch. Ограниченный20секундный diagnostic запуск зафиксировал `sandbox_init() failed with error "Operation not permitted"`, затем `RenderCompositorSWGL failed mapping default framebuffer, no dt`, итог `browserType.launch: Timeout20000ms exceeded`. Начальный объединённый10-case прогон был остановлен:1interrupted/9notrun (`interrupted-report.json`).

По отдельному указанию родителя выполнена попытка без внешнего sandbox-exec, со штатной защитой Firefox и без unsafe flags. Временный context fixture разрешал лишь http(s)запросы к127.0.0.1/localhost/[::1], блокировал остальные, service workers выключены. Копии исходных пятиintegration spec расположены в `work/audit-firefox-specs`; изменены только import-пути для подключения этого fixture. Репозиторий не редактировался.

Штатный запуск тоже не состоялся: `browserType.launch: Timeout20000ms exceeded`, `sandbox_extension_issue_file_to_process failed for .../plugin-container.app: 1 (Operation not permitted)`, затем та же ошибкаSWGL. Runner успел сделать два20секундных launch, начав третий до обнаружения журналом ошибки; собственный runner PID4434 прерван SIGINT, exit130. Фактический итог: **0 проверенных UI-кейсов**,2fixture launch failures/1interrupted/2notrun, всего57.010656с. Повторные запуски прекращены. Это недоступная среда запуска, не установленный дефект приложения. СовместимостьFirefox и OS-level offlineFirefox НЕ подтверждены.

Точная ошибка и traces: `firefox-native-test.log`, `firefox-report.json`, `firefox-results/`. Штатная защитаFirefox не отключалась. Пользовательский браузер/IAB и серверы не изменялись и не останавливались. Все созданные тестовые браузеры завершены.

## Граница вывода

Подтверждён реальный WebKit26.0 прогон на указанном bundle после исправления focus. Не заявляются Safari, Firefox, другиеОС, независимая проверка всех функций нового1c40fa4, полный аудитдоступности или полная безопасность. Новый main потребует отдельного повтора после сигнала родителя.
