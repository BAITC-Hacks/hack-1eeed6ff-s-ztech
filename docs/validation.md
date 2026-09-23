# Фактическая проверка Neverlose

## Backend A0–A3, 23 сентября 2026

Среда: macOS 26.6.2 (25G83), arm64, Apple M4, 16 GiB; Python 3.12.14. Runtime/development пакеты зафиксированы lock-файлами. Не заявляется проверка Windows/Linux или модели 4 CPU / 8 GB.

| Проверка | Результат |
|---|---|
| Оригинальные source manifest SHA-256 | Все совпали |
| `python -m pip check` | No broken requirements found |
| `python -m pytest tests -q` | 61 passed; 1 upstream warning Starlette о будущем переходе TestClient с httpx на httpx2 |
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

Алишер: ветка `codex/workspace-ui`, B1 `7266a72`, контракт A принят. Сопоставлены domain.ts/api.ts с текущим backend: несовместимых имён полей не обнаружено. Его unit/build/E2E результаты записаны им в docs/progress/B.md; на машине A ещё не повторены.

## Остаётся до релиза

Полный UI/graph/transfers сценарий, реальный браузер после интеграции, E2E на настоящем API, независимый новый clone, offline smoke, актуальная финальная сборка, сведения о демо, окончательный SHA и подтверждение подачи. Полный G3/G5/G6 не заявляются. Чувствительность параметров пока не проверена.
