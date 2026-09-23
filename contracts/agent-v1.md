# F13 — необязательный OpenAI-аналитик, аддитивный контракт v1

Статус: backend/API/CLI реализованы и проверены на настоящем OpenAI API 23.09.2026. 25 protocol/failure tests, реальные вопросы и offline core прошли; UI агента ещё отсутствует. E1 UI остаётся у Алишера. Backend/CLI агента не требуют изменений обязательного UI. Не включать кнопку по одному наличию этого документа.

Основной запуск остаётся `python run.py`, полностью offline после установки зависимостей. Опциональный режим: `python run.py --assistant`, локальные `OPENAI_API_KEY` и `OPENAI_MODEL` из окружения или исключённого из Git `.env`. Ключ серверный, никогда не отправляется в браузер, CSV, manifest или журнал инструментов. При обычном запуске `.env` не читается и никаких обращений к OpenAI нет.

`POST /api/v1/agent/query`, JSON `{ "question": "Объясни роль выбранного узла", "gid": "точная строка либо null" }`. `question`: 1–2000 символов до trim; после trim строка не должна быть пустой; `gid`: null или существующая точная строка int64. Действие по явному запросу пользователя отправляет вопрос и выбранные факты в OpenAI. Responses API, `store:false`; это не заявление о полном отсутствии хранения у провайдера. Подписка/ключ не нужны для обязательной проверки жюри.

Ответ:

```json
{
  "run_id": "текущий run_id",
  "model": "gpt-5.4-mini-2026-03-17",
  "status": "answered",
  "answer": "Markdown, собранный сервером из выбранных проверенных утверждений",
  "citations": [
    {"id":"s1","kind":"observation","text":"Точный факт из snapshot","url":"/api/v1/nodes/точный-gid","source_refs":[]}
  ],
  "tool_trace": [
    {"step":1,"tool":"get_node","arguments":{"gid":"точный-gid"},"status":"ok","statement_ids":["s1"]}
  ],
  "usage": {"model_calls":2,"input_tokens":0,"output_tokens":0},
  "limitations": ["Роли — гипотезы; агент не переопределяет правила и не выполняет банковские действия."]
}
```

Выше показана форма, а не реальные результаты. `status=answered|insufficient_data`; недостаточность — осмысленный результат с основаниями, а не provider failure. `citations[].kind=observation|hypothesis|limitation|next_step`. URL/текст/source_refs создаёт сервер. ID утверждения действителен только внутри одного запроса и одного snapshot. `answer` и `citations` содержат выбранные моделью записи одного ledger; текст фактов не сочиняется моделью.

Модель действительно выбирает инструменты, получает факты, решает, каких данных не хватает, и выбирает порядок оснований: `get_overview`, `get_node`, `get_neighbors`, `get_transfers`, `get_cluster`, `compare_hypotheses`, `prepare_brief`. Это не свободный чат и не самостоятельное назначение ролей. Финальная строгая схема модели содержит только status и ID выбранных утверждений. Неизвестные ID/инструменты/аргументы отклоняются; произвольного кода, URL, файлов, SQL и сетевых инструментов нет.

Не более 6 запросов к модели, 8 вызовов инструментов и бюджет 120 секунд на вопрос, проверяемый между обращениями к провайдеру, 1800 output tokens на обращение, 7200 суммарно. Одновременно один запрос агента; основной API продолжает обслуживаться. Переводы/соседи ограничены 20 строками на вызов; total относится ко всему выбранному срезу. Журнал содержит только валидированные аргументы, статусы и ID, без скрытых рассуждений/секретов/provider payload.

Ошибки в обычной `{error:{code,message,details},run_id}` оболочке: 403 `AGENT_ORIGIN_DENIED`, 503 `AGENT_DISABLED`, 429 `AGENT_BUSY`, 502 `AGENT_PROVIDER_ERROR`/`AGENT_INVALID_RESPONSE`, 504 `AGENT_TIMEOUT`, 422 `INVALID_PARAMETER`, 404 `NODE_NOT_FOUND`. Refusal/incomplete/budget exhaustion не превращаются в фиктивный успех. `meta.features.agent=true` только у явно активированного server process с ключом; это конфигурационная доступность, не гарантия доступности провайдера.

CLI: `python run.py --ask "вопрос"` с теми же локальными настройками; печатает JSON ответа и trace, ключ не печатает. Выполненные проверки: поддельные ссылки/текст, неверные аргументы, отказ/timeout, bounded loop, semaphore recovery, неизменность snapshot/CSV, отдельный настоящий OpenAI smoke. UI агента не объявлять завершённым до отдельной реализации B и browser проверки.

Источники реализации: [function calling](https://developers.openai.com/api/docs/guides/function-calling), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [data controls](https://developers.openai.com/api/docs/guides/your-data).
