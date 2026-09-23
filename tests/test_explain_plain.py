from app.explain import explain_node


def node(**changes):
    result = dict(
        gid=12,
        role="consolidator",
        in_degree=8,
        out_degree=2,
        in_tiyin=216050000,
        out_tiyin=51700000,
        in_tx=15,
        out_tx=4,
        seed_reach_count=9,
        boundary=False,
        isolated=False,
        is_seed=False,
        priority_contributions=[],
    )
    result.update(changes)
    return result


def test_priority_reason_uses_observed_counts_and_flow_ratio_without_tracing_money():
    why = explain_node(node(), [], "test")["why"]
    assert "8 плательщиков" in why and "2 получателей" in why
    assert "23.9%" in why and "наблюдаемый" in why.lower()
    assert "пункта" not in why and "полученного" not in why


def test_priority_reason_keeps_missing_inflows_explicit_even_for_seed():
    why = explain_node(node(in_tiyin=0, is_seed=True), [], "test")["why"]
    assert "выход больше входа" in why
    assert "%" not in why
    assert "вход не наблюдается" in why


def test_priority_reason_does_not_turn_boundary_into_a_balance_claim():
    why = explain_node(node(out_tiyin=0, boundary=True), [], "test")["why"]
    assert "не доказывает накопление" in why
    assert "0.0%" in why
