"""Exact direct recipients of a user-selected group; no inferred paths or money tracing."""

from collections import defaultdict
from urllib.parse import urlencode

from pydantic import Field, StrictInt, model_validator

from app.explain import kzt, parse_kzt
from app.schemas import Contract, Gid, Kzt


class CommonRecipientsArgs(Contract):
    gids: list[Gid] = Field(min_length=2, max_length=5)
    min_sources: StrictInt = Field(ge=2, le=5)
    limit: StrictInt = Field(ge=1, le=10)

    @model_validator(mode="after")
    def selection_is_valid(self):
        if len(set(self.gids)) != len(self.gids):
            raise ValueError("DUPLICATE_GID")
        if any(not 0 < int(gid) < 2**63 for gid in self.gids):
            raise ValueError("INVALID_GID")
        if self.min_sources > len(self.gids):
            raise ValueError("MIN_SOURCES_EXCEEDS_SELECTION")
        return self


class SourceFlow(Contract):
    gid: Gid
    sum_kzt: Kzt
    n_tx: int
    source_refs: list[str]


class CommonRecipient(Contract):
    gid: Gid
    source_count: int
    sum_kzt: Kzt
    n_tx: int
    sources: list[SourceFlow]


class CommonRecipientsResult(Contract):
    run_id: str
    source_gids: list[Gid]
    min_sources: int
    matched_recipients: int
    shown_recipients: int
    truncated: bool
    items: list[CommonRecipient]
    limitations: list[str]


COMMON_LIMITATIONS = [
    "Учтены только прямые переводы одного шага от выбранных отправителей, без поиска маршрутов.",
    "Суммы относятся только к выбранным отправителям; это не весь входящий оборот получателя.",
    "Повторяющиеся строки переводов сохранены. Сумма операций не является объёмом уникальных денег.",
    "Неполные входящие, граница четырёх колен и порог выгрузки ограничивают вывод; отсутствие совпадений не исключает другие маршруты.",
    "Общий получатель не доказывает координацию или противоправность. Роли остаются гипотезами.",
]


def common_recipients_url(args: CommonRecipientsArgs) -> str:
    return "/api/v1/analysis/common-recipients?" + urlencode(
        [("gid", gid) for gid in sorted(args.gids, key=int)]
        + [("min_sources", args.min_sources), ("limit", args.limit)]
    )


def find_common_recipients(snapshot, args: CommonRecipientsArgs):
    selected = set(args.gids)
    existing = {n["gid"] for n in snapshot["nodes"]}
    if not selected <= existing:
        raise ValueError("NODE_NOT_FOUND")
    recipients = defaultdict(lambda: defaultdict(list))
    for row in snapshot["transfers"]:
        if row["src"] in selected and row["src"] != row["dst"]:
            recipients[row["dst"]][row["src"]].append(row)
    result = []
    for gid, sources in recipients.items():
        if len(sources) < args.min_sources:
            continue
        flows = []
        total = 0
        for source, rows in sorted(sources.items(), key=lambda item: int(item[0])):
            amount = sum(parse_kzt(row["sum_kzt"]) for row in rows)
            total += amount
            flows.append(
                dict(
                    gid=source,
                    sum_kzt=kzt(amount),
                    n_tx=len(rows),
                    source_refs=[
                        r["source_ref"] for r in sorted(rows, key=lambda r: r["source_row"])
                    ],
                )
            )
        result.append(
            dict(
                gid=gid,
                source_count=len(sources),
                sum_kzt=kzt(total),
                n_tx=sum(flow["n_tx"] for flow in flows),
                sources=flows,
            )
        )
    result.sort(key=lambda r: (-r["source_count"], -parse_kzt(r["sum_kzt"]), int(r["gid"])))
    return CommonRecipientsResult(
        run_id=snapshot["run_id"],
        source_gids=sorted(selected, key=int),
        min_sources=args.min_sources,
        matched_recipients=len(result),
        shown_recipients=min(args.limit, len(result)),
        truncated=len(result) > args.limit,
        items=result[: args.limit],
        limitations=COMMON_LIMITATIONS,
    ).model_dump()
