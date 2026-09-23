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
