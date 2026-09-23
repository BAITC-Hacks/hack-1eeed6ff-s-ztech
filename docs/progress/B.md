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
