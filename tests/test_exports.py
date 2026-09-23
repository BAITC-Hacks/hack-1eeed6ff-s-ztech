import csv
import hashlib
import json
from pathlib import Path

import pandas as pd
import pytest
from conftest import A, B, C, mutate

from app.pipeline import run_pipeline, verify_outputs

CSV_NAMES = ["nodes_roles.csv", "clusters.csv", "top_nodes.csv"]


def test_pipeline_exports_exact_nodes_money_and_source_references(raw_dir, tmp_path):
    out = tmp_path / "result"
    snap = run_pipeline(raw_dir, out)
    rows = list(csv.DictReader((out / "nodes_roles.csv").open()))
    assert {r["gid"] for r in rows} == {str(A), str(B), str(C)}
    assert len(rows) == 3
    isolated = next(r for r in rows if r["gid"] == str(C))
    assert isolated["role"] == "peripheral" and isolated["priority_score"] == "0.000000"
    assert all(0 < len(r["evidence"]) <= 200 for r in rows)
    node = next(n for n in snap["nodes"] if n["gid"] == str(A))
    assert node["out_kzt"] == "10000.02"
    assert node["in_kzt"] == "0.00" and node["observed_ratio"] is None
    assert node["supporting_transfers"]["total"] == 2
    assert len(set(node["supporting_transfers"]["source_refs"])) == 2
    assert sum(c["n_nodes"] for c in snap["clusters"]) == 3
    assert sum(c["n_seed"] for c in snap["clusters"]) == 2
    assert verify_outputs(raw_dir, out)["status"] == "valid"


def test_two_runs_csv_identical_and_timestamp_not_in_run_id(raw_dir, tmp_path):
    s1 = run_pipeline(raw_dir, tmp_path / "one")
    s2 = run_pipeline(raw_dir, tmp_path / "two")
    assert s1["run_id"] == s2["run_id"]
    for name in CSV_NAMES:
        assert (tmp_path / "one" / name).read_bytes() == (tmp_path / "two" / name).read_bytes()


def test_permuted_raw_order_keeps_roles_scores_and_clusters(raw_dir, tmp_path):
    run_pipeline(raw_dir, tmp_path / "one")
    for name in ("nodes", "edges", "transactions"):
        mutate(raw_dir, name, lambda d: d.iloc[::-1].reset_index(drop=True))
    run_pipeline(raw_dir, tmp_path / "two")
    for name in CSV_NAMES:
        assert (tmp_path / "one" / name).read_bytes() == (tmp_path / "two" / name).read_bytes()


def test_failed_input_does_not_replace_valid_result(raw_dir, tmp_path):
    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    mutate(raw_dir, "edges", lambda d: d.__setitem__("n_tx", [100]))
    with pytest.raises(ValueError):
        run_pipeline(raw_dir, out)
    assert before == {p.name: p.read_bytes() for p in out.iterdir()}


def test_invalid_priority_weights_preserve_previous_result(raw_dir, tmp_path):
    from app.roles import load_rules

    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    rules = load_rules()
    rules["priority"].update(turnover=0.65, betweenness=-0.1)
    path = tmp_path / "invalid-rules.json"
    path.write_text(json.dumps(rules))
    with pytest.raises(ValueError, match="Priority weights"):
        run_pipeline(raw_dir, out, rules_path=path)
    assert before == {p.name: p.read_bytes() for p in out.iterdir()}


def test_invalid_cap_preserves_previous_result(raw_dir, tmp_path):
    from app.roles import load_rules

    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    rules = load_rules()
    rules["caps"]["seed"] = 1.1
    path = tmp_path / "invalid-rules.json"
    path.write_text(json.dumps(rules))
    with pytest.raises(ValueError, match="Score caps"):
        run_pipeline(raw_dir, out, rules_path=path)
    assert before == {p.name: p.read_bytes() for p in out.iterdir()}


def test_api_invalid_stage_never_replaces_previous_result(raw_dir, tmp_path, monkeypatch):
    import app.pipeline as pipeline

    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    explain = pipeline.explain_node

    def invalid_node(*args):
        node = explain(*args)
        node["candidates"][0]["raw_score"] = 2.0
        return node

    monkeypatch.setattr(pipeline, "explain_node", invalid_node)
    with pytest.raises(ValueError, match="raw_score"):
        run_pipeline(raw_dir, out)
    assert before == {p.name: p.read_bytes() for p in out.iterdir()}


def test_verify_rejects_modified_csv(raw_dir, tmp_path):
    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    with (out / "top_nodes.csv").open("a") as f:
        f.write("tampered\n")
    with pytest.raises(ValueError, match="hash"):
        verify_outputs(raw_dir, out)


def test_refuse_output_directory_containing_unrelated_files(raw_dir, tmp_path):
    out = tmp_path / "unsafe"
    out.mkdir()
    (out / "notes.txt").write_text("keep me")
    with pytest.raises(ValueError, match="unrelated"):
        run_pipeline(raw_dir, out)
    assert (out / "notes.txt").read_text() == "keep me"


def test_official_full_results_and_raw_accounting(tmp_path):
    raw = Path(__file__).resolve().parents[1] / "data"
    out = tmp_path / "official"
    snap = run_pipeline(raw, out, profile="official")
    assert snap["meta"]["counts"]["nodes"] == 2248
    assert snap["meta"]["counts"]["boundary"] == 444
    assert snap["meta"]["counts"]["isolates"] == 19
    assert snap["meta"]["total_kzt"] == "365890012.01"
    assert snap["meta"]["duration_seconds"] < 300
    rows = pd.read_csv(out / "nodes_roles.csv", dtype={"gid": str})
    assert len(rows) == 2248 and rows.gid.is_unique
    raw_ids = {str(x) for x in pd.read_parquet(raw / "nodes.parquet").gid}
    assert set(rows.gid) == raw_ids
    top = list(csv.DictReader((out / "top_nodes.csv").open()))
    assert len(top) == 50 and [int(r["rank"]) for r in top] == list(range(1, 51))
    assert all(not ("boundary" in n["flags"] and n["role"] == "terminal") for n in snap["nodes"])
    edges = pd.read_parquet(raw / "edges.parquet")
    cluster_of = {n["gid"]: n["cluster_id"] for n in snap["nodes"]}
    internal = 0
    cross = 0
    for src, dst, amount in edges[["src", "dst", "sum_kzt"]].itertuples(index=False, name=None):
        if cluster_of[str(src)] == cluster_of[str(dst)]:
            internal += round(amount * 100)
        else:
            cross += round(amount * 100)
    assert internal + cross == 36_589_001_201
    assert sum(round(float(c["sum_kzt_internal"]) * 100) for c in snap["clusters"]) == internal
    assert verify_outputs(raw, out)["status"] == "valid"
    manifest = json.loads((out / "manifest.json").read_text())
    for name in CSV_NAMES:
        assert (
            manifest["output_hashes"][name] == hashlib.sha256((out / name).read_bytes()).hexdigest()
        )


@pytest.mark.parametrize(
    "collection,field,value",
    [
        ("transfers", "sum_kzt", "999999.99"),
        ("transfers", "source_row", 99),
        ("transfers", "source_ref", "tx:wrong:0"),
        ("transfers", "date", "2026-07-02"),
        ("transfers", "dst", str(C)),
        ("edges", "sum_kzt", "999999.99"),
        ("edges", "n_tx", 99),
        ("edges", "dst", str(C)),
    ],
)
def test_verifier_compares_snapshot_rows_with_raw_not_only_hashes(
    raw_dir, tmp_path, collection, field, value
):
    from app.pipeline import _write_outputs

    out = tmp_path / "results"
    snapshot = run_pipeline(raw_dir, out)
    snapshot[collection][0][field] = value
    _write_outputs(snapshot, out)
    with pytest.raises(ValueError, match="raw"):
        verify_outputs(raw_dir, out)


def test_prior_output_recoverable_even_when_publication_and_rollback_fail(
    raw_dir, tmp_path, monkeypatch
):
    from app import pipeline

    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    previous = (out / "nodes_roles.csv").read_bytes()
    real_replace = pipeline.os.replace
    count = 0

    def broken_replace(source, destination):
        nonlocal count
        count += 1
        if count >= 2:
            raise OSError("injected publication and rollback failure")
        return real_replace(source, destination)

    monkeypatch.setattr(pipeline.os, "replace", broken_replace)
    with pytest.raises(OSError):
        run_pipeline(raw_dir, out)
    assert any(p.read_bytes() == previous for p in tmp_path.rglob("nodes_roles.csv"))


@pytest.mark.parametrize(
    "field,value",
    [("in_degree", 99), ("out_tx", 99), ("depth", 4), ("is_seed", False), ("flags", [])],
)
def test_verifier_rejects_node_facts_that_disagree_with_raw(raw_dir, tmp_path, field, value):
    from app.pipeline import _write_outputs

    out = tmp_path / "results"
    snapshot = run_pipeline(raw_dir, out)
    node = next(n for n in snapshot["nodes"] if n["gid"] == str(A))
    node[field] = value
    _write_outputs(snapshot, out)
    with pytest.raises(ValueError, match="raw"):
        verify_outputs(raw_dir, out)


@pytest.mark.parametrize(
    "field", ["nodes", "edges", "transactions", "seeds", "isolates", "boundary", "clusters"]
)
def test_verifier_rejects_inconsistent_counts_even_with_rehashed_outputs(raw_dir, tmp_path, field):
    from app.pipeline import _write_outputs

    out = tmp_path / "results"
    snapshot = run_pipeline(raw_dir, out)
    snapshot["meta"]["counts"][field] += 1
    _write_outputs(snapshot, out)
    with pytest.raises(ValueError, match="Snapshot metadata"):
        verify_outputs(raw_dir, out)


@pytest.mark.parametrize(
    "field,value",
    [
        ("run_id", "wrong-run"),
        ("schema_version", "999"),
        ("algorithm_version", "wrong-version"),
        ("config_version", "wrong-version"),
        ("package_versions", {}),
        ("period", {"start": "2025-01-01", "end": "2025-01-31"}),
    ],
)
def test_verifier_rejects_inconsistent_snapshot_metadata(raw_dir, tmp_path, field, value):
    from app.pipeline import _write_outputs

    out = tmp_path / "results"
    snapshot = run_pipeline(raw_dir, out)
    snapshot["meta"][field] = value
    _write_outputs(snapshot, out)
    with pytest.raises(ValueError, match="Snapshot metadata"):
        verify_outputs(raw_dir, out)


@pytest.mark.parametrize(
    "field", ["role_counts", "boundary_count", "cross_in_kzt", "cross_out_kzt"]
)
def test_verifier_rejects_inconsistent_cluster_aggregates(raw_dir, tmp_path, field):
    from app.pipeline import _write_outputs

    out = tmp_path / "results"
    snapshot = run_pipeline(raw_dir, out)
    group = snapshot["clusters"][0]
    if field == "role_counts":
        group[field]["peripheral"] += 1
    elif field == "boundary_count":
        group[field] += 1
    else:
        group[field] = "999.99"
    _write_outputs(snapshot, out)
    with pytest.raises(ValueError, match="Cluster statistics"):
        verify_outputs(raw_dir, out)


@pytest.mark.parametrize(
    "field,value",
    [
        ("counts", {}),
        ("input_rows", {}),
        ("algorithm_version", "wrong-version"),
        ("package_versions", {}),
        ("generated_at", "wrong-date"),
        ("duration_seconds", -1),
        ("limitations", []),
    ],
)
def test_verifier_rejects_manifest_metadata_that_disagrees_with_result(
    raw_dir, tmp_path, field, value
):
    out = tmp_path / "results"
    run_pipeline(raw_dir, out)
    path = out / "manifest.json"
    manifest = json.loads(path.read_text())
    manifest[field] = value
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Manifest metadata"):
        verify_outputs(raw_dir, out)


def test_verifier_preserves_direction_of_cross_cluster_amounts(raw_dir, tmp_path, monkeypatch):
    from app.pipeline import _write_outputs

    # A -> B has two real fixture rows. Separate their clusters to exercise
    # nonzero external amounts rather than only empty cross-cluster sums.
    monkeypatch.setattr("app.pipeline.assign_clusters", lambda graph, rules: {A: 1, B: 2, C: 3})
    out = tmp_path / "results"
    snapshot = run_pipeline(raw_dir, out)
    groups = {group["cluster_id"]: group for group in snapshot["clusters"]}
    assert groups[1]["cross_out_kzt"] == groups[2]["cross_in_kzt"] == "10000.02"
    assert groups[1]["cross_in_kzt"] == groups[2]["cross_out_kzt"] == "0.00"
    assert verify_outputs(raw_dir, out)["status"] == "valid"
    groups[1]["cross_in_kzt"], groups[1]["cross_out_kzt"] = (
        groups[1]["cross_out_kzt"],
        groups[1]["cross_in_kzt"],
    )
    _write_outputs(snapshot, out)
    with pytest.raises(ValueError, match="Cluster statistics"):
        verify_outputs(raw_dir, out)
