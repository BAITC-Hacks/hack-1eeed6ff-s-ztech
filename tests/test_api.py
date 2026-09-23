import json
from pathlib import Path

import pytest
from conftest import A, B, C
from fastapi.testclient import TestClient

from app.api import create_app
from app.pipeline import run_pipeline
from app.schemas import NodeDetail


@pytest.fixture
def client(raw_dir, tmp_path):
    out = tmp_path / "output"
    s = run_pipeline(raw_dir, out)
    return TestClient(create_app(s, out), base_url="http://127.0.0.1")


def test_long_ids_survive_api_and_real_node_parser(client):
    node = client.get(f"/api/v1/nodes/{A}").json()
    other = client.get(f"/api/v1/nodes/{B}").json()
    assert node["gid"] == str(A) and other["gid"] == str(B)
    assert NodeDetail.model_validate(node).out_kzt == "10000.02"
    assert node["run_id"] == other["run_id"] == client.get("/api/v1/meta").json()["run_id"]
    assert node["out_tx"] == 2 and node["supporting_transfers"]["total"] == 2


def test_transfer_sums_do_not_depend_on_pagination_and_keep_duplicates(client):
    p1 = client.get(f"/api/v1/nodes/{A}/transfers?limit=1&offset=0").json()
    p2 = client.get(f"/api/v1/nodes/{A}/transfers?limit=1&offset=1").json()
    assert p1["total"] == p2["total"] == 2
    assert p1["sum_kzt"] == p2["sum_kzt"] == "10000.02"
    assert p1["in_kzt"] == "0.00" and p1["out_kzt"] == "10000.02"
    assert p1["items"][0]["source_ref"] != p2["items"][0]["source_ref"]
    assert client.get(f"/api/v1/nodes/{A}/transfers?direction=in").json()["total"] == 0


def test_graph_root_always_retained_and_truncation_honest(client):
    graph = client.get(f"/api/v1/graph?mode=ego&gid={B}&limit=1").json()
    assert [n["gid"] for n in graph["nodes"]] == [str(B)]
    assert graph["truncated"] and graph["counts"]["matched_nodes"] == 2
    graph = client.get(f"/api/v1/graph?mode=ego&gid={A}").json()
    assert graph["edges"][0]["source"] == "n:" + str(A)
    assert graph["edges"][0]["target"] == "n:" + str(B)
    assert graph["edges"][0]["sum_kzt"] == "10000.02"
    isolated = client.get(f"/api/v1/graph?mode=ego&gid={C}").json()
    assert len(isolated["nodes"]) == 1 and isolated["edges"] == []


@pytest.mark.parametrize(
    "path,status",
    [
        ("/api/v1/nodes/999", 404),
        ("/api/v1/nodes/garbage", 422),
        ("/api/v1/nodes/9999999999999999999", 422),
        ("/api/v1/nodes?limit=201", 422),
        ("/api/v1/nodes?offset=-1", 422),
        ("/api/v1/nodes?role=criminal", 422),
        ("/api/v1/graph?mode=ego", 422),
        ("/api/v1/graph?mode=cluster", 422),
        ("/api/v1/graph?hops=3", 422),
        ("/api/v1/clusters/999", 404),
        ("/api/v1/exports/private.env", 404),
        ("/api/v1/missing", 404),
    ],
)
def test_errors_are_safe_and_follow_contract(client, path, status):
    r = client.get(path)
    assert r.status_code == status
    assert set(r.json()) == {"error", "run_id"}
    assert set(r.json()["error"]) == {"code", "message", "details"}


def test_exports_are_same_result_and_frozen_when_disk_changes(client):
    r = client.get("/api/v1/exports/nodes_roles.csv")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    assert str(A) in r.text and str(B) in r.text
    assert r.headers["x-run-id"] == client.get("/health").json()["run_id"]


def test_cluster_and_node_filters_preserve_global_scores(client):
    original = client.get(f"/api/v1/nodes/{C}").json()
    page = client.get(f"/api/v1/nodes?cluster_id={original['cluster_id']}").json()
    assert page["total"] == 1 and page["items"][0]["gid"] == str(C)
    assert page["items"][0]["priority_score"] == 0
    clusters = client.get("/api/v1/clusters").json()
    assert sum(c["n_nodes"] for c in clusters["items"]) == 3
    brief = client.get(f"/api/v1/nodes/{A}/brief")
    assert brief.status_code == 200 and str(A) in brief.text and "tx:" in brief.text


def test_synthetic_fixture_conforms_to_published_types():
    f = json.loads((Path(__file__).resolve().parents[1] / "contracts/v1.example.json").read_text())
    assert NodeDetail.model_validate(f["node_detail"]).gid == "900000000000000002"


def test_exports_stay_with_loaded_snapshot_after_disk_replacement(raw_dir, tmp_path):
    import csv
    import io

    from app.roles import load_rules

    out = tmp_path / "result"
    original = run_pipeline(raw_dir, out)
    rules = load_rules()
    rules["priority"]["turnover"] = 0.4
    rules["priority"]["betweenness"] = 0.15
    rules_path = tmp_path / "changed.json"
    rules_path.write_text(json.dumps(rules))
    changed = run_pipeline(raw_dir, out, rules_path=rules_path)
    assert original["run_id"] != changed["run_id"]
    client = TestClient(create_app(original, out), base_url="http://127.0.0.1")
    node = client.get(f"/api/v1/nodes/{A}").json()
    response = client.get("/api/v1/exports/nodes_roles.csv")
    rows = {r["gid"]: r for r in csv.DictReader(io.StringIO(response.text))}
    assert rows[str(A)]["priority_score"] == f"{node['priority_score']:.6f}"
    assert response.headers["x-run-id"] == original["run_id"]
    (out / "nodes_roles.csv").write_text("corrupt after startup")
    assert client.get("/api/v1/exports/nodes_roles.csv").content == response.content


@pytest.mark.parametrize(
    "path", ["/api/v1/clusters/-1", "/api/v1/graph?mode=cluster&cluster_id=-1"]
)
def test_negative_cluster_identifier_is_invalid_parameter(client, path):
    assert client.get(path).status_code == 422


@pytest.mark.parametrize(
    "host",
    [
        "untrusted.example:8000",
        "localhost.evil.test",
        "user@localhost",
        "127.0.0.1.evil.test",
        "[::1]@evil.test",
        "",
    ],
)
@pytest.mark.parametrize(
    "path", ["/health", "/api/v1/meta", "/api/v1/exports/nodes_roles.csv", "/"]
)
def test_foreign_hosts_cannot_read_any_local_route(client, host, path):
    response = client.get(path, headers={"host": host})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "HOST_DENIED"
    assert set(response.json()) == {"error", "run_id"}


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost:8000", "LOCALHOST:8000", "[::1]:8000"])
def test_documented_loopback_hosts_keep_working(client, host):
    assert client.get("/api/v1/meta", headers={"host": host}).status_code == 200
    assert client.get("/api/v1/exports/nodes_roles.csv", headers={"host": host}).status_code == 200


def test_duplicate_host_is_rejected(client):
    response = client.get("/health", headers=[("host", "localhost"), ("host", "evil.test")])
    assert response.status_code == 403
