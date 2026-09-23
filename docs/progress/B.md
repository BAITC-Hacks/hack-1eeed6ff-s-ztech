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
