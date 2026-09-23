import copy
from itertools import combinations

import networkx as nx
import pytest
from conftest import A, B, C
from fastapi.testclient import TestClient

from app.api import create_app
from app.experiments import simulate_removal
from app.pipeline import CSV_COLUMNS, run_pipeline


def test_chain_baseline_excludes_removed_node_but_keeps_its_connecting_path():
    graph = nx.DiGraph([(str(A), str(B)), (str(B), str(C))])
    result = simulate_removal(graph, [str(B)])
    assert result["remaining_nodes"] == 2 and result["removed_edges"] == 2
    assert result["before"]["connected_pairs"] == 1
    assert result["after"]["connected_pairs"] == 0
    assert result["affected_pairs"] == 1 and result["affected_pairs_fraction"] == 1
    assert result["before"]["components"] == 1 and result["after"]["components"] == 2
    assert result["after"]["largest_component_fraction"] == 0.5
    assert set(graph.edges) == {(str(A), str(B)), (str(B), str(C))}


def test_triangle_has_no_connectivity_loss_between_remaining_vertices():
    graph = nx.DiGraph([("1", "2"), ("2", "3"), ("3", "1")])
    result = simulate_removal(graph, ["2"])
    assert result["before"]["connected_pairs"] == result["after"]["connected_pairs"] == 1
    assert result["affected_pairs_fraction"] == 0
    assert result["removed_edges"] == 2


def test_weak_connectivity_ignores_direction_and_counts_reciprocal_edges_once_each():
    graph = nx.DiGraph([("1", "2"), ("2", "1"), ("3", "2")])
    result = simulate_removal(graph, ["2"])
    assert result["affected_pairs"] == 1 and result["removed_edges"] == 3


@pytest.mark.parametrize("removed", [["1"], ["1", "2"]])
def test_no_pairs_has_null_fraction_instead_of_false_hundred_percent(removed):
    graph = nx.DiGraph()
    graph.add_nodes_from(["1", "2"])
    result = simulate_removal(graph, removed)
    assert result["affected_pairs"] == 0
    assert result["affected_pairs_fraction"] is None
    if len(removed) == 2:
        assert result["after"] == dict(
            components=0,
            largest_component_size=0,
            largest_component_fraction=None,
            connected_pairs=0,
        )


def test_component_entirely_removed_does_not_count_in_baseline():
    graph = nx.DiGraph([("1", "2"), ("3", "4")])
    graph.add_node("5")
    result = simulate_removal(graph, ["1", "2"])
    assert result["before"]["components"] == result["after"]["components"] == 2
    assert result["before"]["connected_pairs"] == result["after"]["connected_pairs"] == 1
    assert result["before"]["largest_component_fraction"] == 2 / 3


def test_pair_counts_match_independent_path_enumeration_for_small_random_graphs():
    for seed in range(6):
        graph = nx.gnp_random_graph(8, 0.2, seed=seed, directed=True)
        graph = nx.relabel_nodes(graph, str)
        for removed in [("0",), ("0", "3"), ("0", "3", "5")]:
            result = simulate_removal(graph, removed)
            before = graph.to_undirected()
            after = before.copy()
            after.remove_nodes_from(removed)
            pairs = list(combinations(after.nodes, 2))
            expected_before = sum(nx.has_path(before, a, b) for a, b in pairs)
            expected_after = sum(nx.has_path(after, a, b) for a, b in pairs)
            assert result["before"]["connected_pairs"] == expected_before
            assert result["after"]["connected_pairs"] == expected_after
            assert result["affected_pairs"] == expected_before - expected_after


@pytest.fixture
def removal_client(raw_dir, tmp_path):
    out = tmp_path / "out"
    snapshot = run_pipeline(raw_dir, out)
    return TestClient(create_app(snapshot, out), base_url="http://127.0.0.1"), snapshot, out


def test_api_preserves_snapshot_exports_and_exact_ids_and_order_invariant_result(removal_client):
    client, snapshot, out = removal_client
    original = copy.deepcopy(snapshot)
    csv_before = {name: client.get("/api/v1/exports/" + name).content for name in CSV_COLUMNS}
    first = client.post("/api/v1/experiments/removal", json={"gids": [str(B), str(A)]})
    second = client.post("/api/v1/experiments/removal", json={"gids": [str(A), str(B)]})
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["removed_gids"] == [str(A), str(B)]
    assert first.json()["run_id"] == snapshot["run_id"]
    assert first.json()["method"] == "weak_components_remaining_nodes"
    assert snapshot == original
    for name, contents in csv_before.items():
        assert (
            client.get("/api/v1/exports/" + name).content == contents == (out / name).read_bytes()
        )


@pytest.mark.parametrize(
    "body,status,code",
    [
        ({"gids": []}, 422, "INVALID_PARAMETER"),
        ({"gids": [str(A)] * 4}, 422, "INVALID_PARAMETER"),
        ({"gids": [A]}, 422, "INVALID_PARAMETER"),
        ({"gids": [str(A), str(A)]}, 422, "DUPLICATE_GID"),
        ({"gids": ["999"]}, 404, "NODE_NOT_FOUND"),
        ({"gids": ["0"]}, 422, "INVALID_GID"),
        ({"gids": ["9999999999999999999"]}, 422, "INVALID_GID"),
        ({"gids": [str(A)], "commit": True}, 422, "INVALID_PARAMETER"),
    ],
)
def test_removal_api_rejects_invalid_requests_without_mutation(removal_client, body, status, code):
    client, snapshot, _ = removal_client
    response = client.post("/api/v1/experiments/removal", json=body)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert response.json()["run_id"] == snapshot["run_id"]
