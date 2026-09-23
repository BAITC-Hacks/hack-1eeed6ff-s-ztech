import copy

import pytest
from pydantic import ValidationError

from app.common_recipients import CommonRecipientsArgs, find_common_recipients

A, B, C, D, E = (str(900000000000000001 + i) for i in range(5))


def snapshot():
    rows = [
        (A, C, "5000.01"),
        (A, C, "5000.01"),
        (B, C, "7000.03"),
        (A, D, "9000.00"),
        (B, D, "8000.00"),
        (E, C, "50000.00"),
    ]
    return {
        "run_id": "synthetic-test",
        "nodes": [{"gid": g} for g in [A, B, C, D, E]],
        "transfers": [
            dict(src=a, dst=b, sum_kzt=v, source_row=i, source_ref=f"tx:{i}", date="2026-07-01")
            for i, (a, b, v) in enumerate(rows)
        ],
    }


def test_exact_common_recipients_duplicates_and_exclusion_of_other_senders():
    data = snapshot()
    before = copy.deepcopy(data)
    result = find_common_recipients(
        data, CommonRecipientsArgs(gids=[A, B], min_sources=2, limit=10)
    )
    assert [x["gid"] for x in result["items"]] == [C, D]
    first = result["items"][0]
    assert first["sum_kzt"] == "17000.05" and first["n_tx"] == 3 and first["source_count"] == 2
    assert first["sources"][0]["source_refs"] == ["tx:0", "tx:1"]
    assert first["sources"][0]["sum_kzt"] == "10000.02"
    assert first["sources"][1]["gid"] == B
    assert data == before


def test_limit_preserves_total_and_order_is_stable_when_rows_are_reversed():
    data = snapshot()
    args = CommonRecipientsArgs(gids=[B, A], min_sources=2, limit=1)
    first = find_common_recipients(data, args)
    data["transfers"].reverse()
    assert find_common_recipients(data, args) == first
    assert (
        first["matched_recipients"] == 2 and first["shown_recipients"] == 1 and first["truncated"]
    )


def test_all_sources_and_partial_coverage_have_explicit_semantics():
    data = snapshot()
    all_sources = find_common_recipients(
        data, CommonRecipientsArgs(gids=[A, B, E], min_sources=3, limit=10)
    )
    partial = find_common_recipients(
        data, CommonRecipientsArgs(gids=[A, B, E], min_sources=2, limit=10)
    )
    assert len(all_sources["items"]) == 1 and all_sources["items"][0]["sum_kzt"] == "67000.05"
    assert partial["items"][1]["source_count"] == 2
    assert partial["source_gids"] == [A, B, E] and partial["min_sources"] == 2


def test_zero_matches_does_not_assert_no_paths_or_no_external_transfers():
    result = find_common_recipients(
        snapshot(), CommonRecipientsArgs(gids=[C, D], min_sources=2, limit=10)
    )
    assert result["items"] == [] and result["matched_recipients"] == 0
    assert any("одного шага" in text for text in result["limitations"])


@pytest.mark.parametrize(
    "gids, minimum",
    [
        ([A], 2),
        ([A, A], 2),
        ([A, B], 3),
        ([A, B, C, D, E, "5"], 2),
        (["0", B], 2),
        (["9223372036854775808", B], 2),
        ([int(A), B], 2),
    ],
)
def test_bad_selection_is_rejected(gids, minimum):
    with pytest.raises(ValidationError):
        CommonRecipientsArgs(gids=gids, min_sources=minimum, limit=10)


def test_unknown_gid_is_not_silently_dropped():
    with pytest.raises(ValueError, match="NODE_NOT_FOUND"):
        find_common_recipients(
            snapshot(), CommonRecipientsArgs(gids=[A, "8"], min_sources=2, limit=10)
        )


def test_directed_one_hop_only_and_numeric_tie_break():
    data = snapshot()
    data["transfers"] = [
        dict(src=a, dst=b, sum_kzt="1.00", source_row=i, source_ref=f"tx:{i}")
        for i, (a, b) in enumerate([(A, C), (C, D), (B, D), (E, A), (E, B)])
    ]
    result = find_common_recipients(
        data, CommonRecipientsArgs(gids=[A, B], min_sources=2, limit=10)
    )
    assert result["items"] == []  # A -> C -> D and E -> A/B are not A/B -> recipient.
    data = snapshot()
    for row in data["transfers"]:
        row["sum_kzt"] = "1.00" if row["dst"] == C else "1.50"
    result = find_common_recipients(
        data, CommonRecipientsArgs(gids=[A, B], min_sources=2, limit=10)
    )
    assert [r["gid"] for r in result["items"]] == [C, D]


def test_agent_cannot_drop_sources_lower_coverage_or_omit_recipients():
    import json

    from test_assistant import call, final, response

    from app.assistant import AgentConfig, Assistant

    data = snapshot()
    data.update(clusters=[], edges=[])
    for row in data["transfers"]:
        row.setdefault("date", "2026-07-01")
    for bad in [
        dict(gids=[A, B], min_sources=2, limit=10),
        dict(gids=[A, B, E], min_sources=2, limit=10),
    ]:
        calls = []

        def provider(payload, timeout):
            calls.append(payload)
            if len(calls) == 1:
                return response([call("find_common_recipients", bad)])
            if len(calls) == 2:
                assert json.loads(payload["input"][-1]["output"]) == {
                    "error": "INVALID_TOOL_ARGUMENTS_OR_UNKNOWN_NODE"
                }
                return response(
                    [call("find_common_recipients", dict(gids=[A, B, E], min_sources=3, limit=10))]
                )
            statements = json.loads(payload["input"][-1]["output"])["statements"]
            return final([next(s["id"] for s in statements if s["kind"] == "limitation")])

        answer = Assistant(data, AgentConfig("test-only"), provider).ask(
            f"Общие получатели от ВСЕХ {A}, {B}, {E}", None
        )
        assert answer["tool_trace"][0]["status"] == "error"
        assert answer["tool_trace"][1]["arguments"]["gids"] == [A, B, E]
        assert f"Получатель {C}" in answer["answer"] and "67000.05" in answer["answer"]
        assert "от 3 из 3" in answer["answer"]
        assert f"Получатель {D}" not in answer["answer"]
