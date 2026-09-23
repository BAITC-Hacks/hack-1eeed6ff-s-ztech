import networkx as nx
import pytest

from app.clusters import assign_clusters, undirected_projection
from app.features import compute_features
from app.ranking import rank_nodes
from app.roles import classify, load_rules, positive_percentiles


def profile(**changes):
    values = dict(
        gid=10,
        depth=2,
        is_seed=False,
        in_degree=1,
        out_degree=1,
        in_tiyin=1_000_000,
        out_tiyin=1_000_000,
        in_tx=2,
        out_tx=2,
        observed_ratio=1.0,
        seed_reach_count=1,
        boundary=False,
        isolated=False,
        pagerank=0.1,
        betweenness=0.1,
        participation=0.2,
        cluster_id=1,
    )
    values.update(changes)
    return values


def percentiles(**changes):
    p = dict(
        in_tiyin=0.5,
        out_tiyin=0.5,
        min_flow=0.5,
        turnover=0.5,
        in_degree=0.5,
        out_degree=0.5,
        betweenness=0.5,
        pagerank=0.5,
    )
    p.update(changes)
    return p


def test_positive_rank_excludes_zero_and_keeps_ties():
    assert positive_percentiles([0, 2, 2, 4]) == [0, 2 / 3, 2 / 3, 1]
    assert positive_percentiles([0, 0]) == [0, 0]


def test_role_weight_cardinality_cannot_silently_drop_extra_weights(tmp_path):
    import json

    rules = load_rules()
    rules["roles"]["distributor"]["weights"] = [0.6, 0.3, 0.1]
    path = tmp_path / "rules.json"
    path.write_text(json.dumps(rules))
    with pytest.raises(ValueError, match="role weights"):
        load_rules(path)


def test_transit_only_with_observed_comparable_flow():
    r = classify(profile(), percentiles(), load_rules())
    assert r["role"] == "transit"
    assert r["raw_score"] == pytest.approx(0.7666666666666666)
    assert r["role_score"] == r["raw_score"]


@pytest.mark.parametrize("score,cap", [(0.2, 0.1), (0.9, 0.65)])
def test_peripheral_score_obeys_configured_observation_cap(score, cap):
    rules = load_rules()
    rules["roles"]["peripheral"]["observed_score"] = score
    rules["caps"]["seed"] = cap
    result = classify(profile(is_seed=True, depth=0), percentiles(), rules)
    assert result["role"] == "peripheral"
    assert result["raw_score"] == score
    assert result["role_score"] == cap
    assert next(c for c in result["candidates"] if c["role"] == "peripheral")["capped_score"] == cap


@pytest.mark.parametrize(
    "changes",
    [
        dict(is_seed=True, depth=0),
        dict(boundary=True, depth=4),
        dict(observed_ratio=1.21),
        dict(in_tiyin=0, observed_ratio=None),
    ],
)
def test_transit_rejects_incomplete_or_incompatible_observations(changes):
    r = classify(profile(**changes), percentiles(), load_rules())
    assert not next(c for c in r["candidates"] if c["role"] == "transit")["eligible"]


def test_boundary_cannot_be_terminal_but_can_show_consolidation():
    f = profile(
        depth=4,
        boundary=True,
        in_degree=8,
        out_degree=0,
        out_tiyin=0,
        observed_ratio=0,
        seed_reach_count=3,
    )
    r = classify(f, percentiles(in_tiyin=1), load_rules())
    assert r["role"] == "consolidator"
    assert r["raw_score"] == 1
    assert r["role_score"] == 0.65
    assert not next(c for c in r["candidates"] if c["role"] == "terminal")["eligible"]


def test_terminal_is_observed_end_before_boundary_with_cap():
    r = classify(
        profile(out_degree=0, out_tiyin=0, observed_ratio=0), percentiles(in_tiyin=1), load_rules()
    )
    assert r["role"] == "terminal"
    assert r["role_score"] == 0.65


def test_fan_out_distributor_and_single_observation_cap():
    r = classify(profile(out_degree=20, observed_ratio=5), percentiles(out_tiyin=1), load_rules())
    assert r["role"] == "distributor" and r["raw_score"] == 1
    r = classify(profile(in_tx=1, out_tx=0), percentiles(), load_rules())
    assert r["role_score"] == 0.45


def test_coordinator_is_structural_candidate_with_cap():
    r = classify(
        profile(in_degree=2, out_degree=2, seed_reach_count=5, participation=0.8, observed_ratio=2),
        percentiles(betweenness=1, pagerank=1),
        load_rules(),
    )
    assert r["role"] == "coordinator"
    assert r["role_score"] == 0.55
    assert r["raw_score"] > 0.55


def test_choose_raw_score_before_caps_and_explain_alternative():
    r = classify(
        profile(
            in_degree=8, out_degree=20, seed_reach_count=3, is_seed=True, depth=0, observed_ratio=1
        ),
        percentiles(in_tiyin=1, out_tiyin=1),
        load_rules(),
    )
    assert r["role"] == "consolidator"  # raw tie resolved by published order
    assert r["role_score"] == 0.65
    assert r["alternative"]["role"] == "distributor"


def test_isolate_has_zero_scores_even_though_pagerank_is_positive():
    f = profile(
        in_degree=0,
        out_degree=0,
        in_tiyin=0,
        out_tiyin=0,
        in_tx=0,
        out_tx=0,
        observed_ratio=None,
        is_seed=True,
        isolated=True,
        depth=0,
        seed_reach_count=0,
        participation=0,
    )
    r = classify(f, percentiles(), load_rules())
    assert (r["role"], r["role_score"]) == ("peripheral", 0)
    ranked = rank_nodes([dict(f, **r)], load_rules())
    assert ranked[0]["priority_score"] == 0


def test_reciprocal_projection_and_connected_singleton_clusters():
    g = nx.DiGraph()
    g.add_nodes_from([1, 2, 3, 4, 5])
    g.add_edge(1, 2, sum_tiyin=100, n_tx=1)
    g.add_edge(2, 1, sum_tiyin=300, n_tx=1)
    g.add_edge(3, 4, sum_tiyin=500, n_tx=1)
    u = undirected_projection(g)
    assert u[1][2]["sum_tiyin"] == 400
    members = assign_clusters(g, load_rules())
    assert members[1] == members[2]
    assert members[3] == members[4]
    assert len(set(members.values())) == 3
    assert members[5] != members[1]


def test_seed_reach_does_not_count_itself_and_stops_at_four_hops():
    g = nx.DiGraph()
    for n in range(7):
        g.add_node(n, depth=min(n, 4), is_seed=n == 0)
    for n in range(5):
        g.add_edge(n, n + 1, sum_tiyin=500_000, n_tx=1)
    g.add_edge(2, 0, sum_tiyin=500_000, n_tx=1)
    f = compute_features(g, assign_clusters(g, load_rules()), load_rules())
    assert f[0]["seed_reach_count"] == 0
    assert f[4]["seed_reach_count"] == 1
    assert f[5]["seed_reach_count"] == 0
    assert f[6]["isolated"]
    assert f[0]["in_tiyin"] == 500_000
    assert f[5]["observed_ratio"] == 0


def test_priority_contributions_sum_and_ties_use_exact_gid():
    nodes = [profile(gid=100000000011452101), profile(gid=100000000011452100)]
    result = rank_nodes(nodes, load_rules())
    assert [r["gid"] for r in result] == [100000000011452100, 100000000011452101]
    for r in result:
        assert sum(c["contribution"] for c in r["priority_contributions"]) == pytest.approx(
            r["priority_score"], abs=1e-12
        )
