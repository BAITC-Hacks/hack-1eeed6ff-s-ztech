"""One local command from raw parquet to verified CSV and the analyst workspace."""

import argparse
import json
import sys
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parent


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Neverlose · Граф денег — локальный пересчёт и просмотр"
    )
    parser.add_argument("--data", type=Path, default=ROOT / "data")
    parser.add_argument("--out", type=Path, default=ROOT / "results")
    parser.add_argument("--rules", type=Path, default=ROOT / "config/rules.json")
    parser.add_argument("--profile", choices=["official", "generic"], default="official")
    parser.add_argument("--host", choices=["127.0.0.1", "localhost", "::1"], default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--assistant",
        action="store_true",
        help="Включить необязательный OpenAI-аналитик (нужен локальный ключ)",
    )
    parser.add_argument("--gid", help="Точный gid для --ask")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--pipeline-only", action="store_true")
    modes.add_argument("--verify-only", action="store_true")
    modes.add_argument("--ask", help="Вопрос OpenAI-аналитику; ответ JSON и журнал инструментов")
    modes.add_argument(
        "--api-only", action="store_true", help="Разработка API без готовой web/dist"
    )
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be 1..65535")
    if args.gid and args.ask is None:
        parser.error("--gid используется только вместе с --ask")
    if sys.version_info[:2] != (3, 12):
        print("Требуется Python 3.12; создайте .venv по README.", file=sys.stderr)
        return 2
    try:
        import uvicorn

        from app.api import create_app
        from app.pipeline import run_pipeline, verify_outputs
    except ImportError as exc:
        print(
            f"Не хватает зависимости: {exc.name}. Выполните: python -m pip install -r requirements.lock",
            file=sys.stderr,
        )
        return 2
    try:
        if args.verify_only:
            print(
                json.dumps(
                    verify_outputs(
                        args.data, args.out, rules_path=args.rules, profile=args.profile
                    ),
                    ensure_ascii=False,
                )
            )
            return 0
        web_dist = ROOT / "web/dist"
        if (
            not args.pipeline_only
            and not args.api_only
            and args.ask is None
            and not (web_dist / "index.html").is_file()
        ):
            raise ValueError(
                "Нет web/dist/index.html. В каталоге web выполните npm ci и npm run build. Для расчёта CSV используйте --pipeline-only; для разработки API --api-only."
            )
        start = perf_counter()
        snapshot = run_pipeline(args.data, args.out, rules_path=args.rules, profile=args.profile)
        elapsed = perf_counter() - start
        print(
            json.dumps(
                dict(
                    status="ready",
                    run_id=snapshot["run_id"],
                    counts=snapshot["meta"]["counts"],
                    pipeline_wall_seconds=round(elapsed, 6),
                    out=str(args.out.resolve()),
                ),
                ensure_ascii=False,
            ),
            flush=True,
            file=sys.stderr if args.ask is not None else sys.stdout,
        )
        if args.pipeline_only:
            return 0
        assistant = None
        if args.assistant or args.ask is not None:
            from app.assistant import AgentConfig, Assistant

            assistant = Assistant(snapshot, AgentConfig.load(ROOT / ".env"))
        if args.ask is not None:
            print(json.dumps(assistant.ask(args.ask, args.gid), ensure_ascii=False, indent=2))
            return 0
        application = create_app(
            snapshot, args.out, None if args.api_only else web_dist, assistant=assistant
        )
        print(f"Neverlose: http://{args.host}:{args.port} — остановка Ctrl+C", flush=True)
        uvicorn.run(application, host=args.host, port=args.port, log_level="info")
        return 0
    except (ValueError, OSError, KeyError) as exc:
        print(f"Ошибка запуска: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
