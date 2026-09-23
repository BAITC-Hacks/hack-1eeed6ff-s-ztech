"""One validated calculation supplies CSV, API and UI. No online services."""

import csv
import json
import os
import tempfile
from datetime import datetime, timezone
from hashlib import sha256
from importlib.metadata import version
from pathlib import Path
from time import perf_counter

import networkx as nx

from app import ALGORITHM_VERSION
from app.clusters import assign_clusters
from app.explain import LIMITATIONS, cluster_summaries, explain_node, kzt, parse_kzt
from app.features import build_graph, compute_features
from app.loader import load_dataset
from app.ranking import rank_nodes
from app.roles import DEFAULT_RULES, ROLE_NAMES, classify, feature_percentiles, load_rules

CSV_COLUMNS = {
    "nodes_roles.csv": ["gid", "role", "role_score", "cluster_id", "priority_score", "evidence"],
    "clusters.csv": [
        "cluster_id",
        "n_nodes",
        "n_seed",
        "sum_kzt_internal",
        "top_gids",
        "hypothesis",
    ],
    "top_nodes.csv": ["rank", "gid", "role", "priority_score", "why"],
}
OUTPUT_NAMES = set(CSV_COLUMNS) | {"snapshot.json", "manifest.json"}


def canonical_json(value):
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def identity(hashes, rules):
    versions = {name: version(name) for name in ("pandas", "numpy", "pyarrow", "networkx", "scipy")}
    parts = dict(
        source_hashes=hashes,
        config=rules,
        algorithm_version=ALGORITHM_VERSION,
        package_versions=versions,
    )
    return sha256(canonical_json(parts)).hexdigest(), versions


def export_rows(snapshot):
    nodes = []
    for node in snapshot["nodes"]:
        nodes.append(
            {
                k: f"{node[k]:.6f}" if k.endswith("_score") else node[k]
                for k in CSV_COLUMNS["nodes_roles.csv"]
            }
        )
    clusters = [
        {k: ";".join(c[k]) if k == "top_gids" else c[k] for k in CSV_COLUMNS["clusters.csv"]}
        for c in snapshot["clusters"]
    ]
    top = [
        dict(
            rank=i,
            gid=n["gid"],
            role=n["role"],
            priority_score=f"{n['priority_score']:.6f}",
            why=n["why"],
        )
        for i, n in enumerate(
            snapshot["nodes"][: min(snapshot["config"]["top_n"], len(snapshot["nodes"]))], 1
        )
    ]
    return dict(zip(CSV_COLUMNS, (nodes, clusters, top)))


def _write_outputs(snapshot, stage):
    for name, rows in export_rows(snapshot).items():
        with (stage / name).open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS[name], lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    (stage / "snapshot.json").write_bytes(canonical_json(snapshot) + b"\n")
    manifest = dict(
        run_id=snapshot["run_id"],
        algorithm_version=ALGORITHM_VERSION,
        config_hash=sha256(canonical_json(snapshot["config"])).hexdigest(),
        package_versions=snapshot["meta"]["package_versions"],
        source_hashes=snapshot["meta"]["source_hashes"],
        input_rows=snapshot["audit"]["rows"],
        counts=snapshot["meta"]["counts"],
        duration_seconds=snapshot["meta"]["duration_seconds"],
        generated_at=snapshot["meta"]["generated_at"],
        limitations=LIMITATIONS,
        output_hashes={
            n: sha256((stage / n).read_bytes()).hexdigest()
            for n in sorted(OUTPUT_NAMES - {"manifest.json"})
        },
    )
    (stage / "manifest.json").write_bytes(canonical_json(manifest) + b"\n")


def _safe_output(data_dir, out):
    if out.is_symlink():
        raise ValueError("Output directory must not be a symlink")
    raw = Path(data_dir).resolve()
    target = out.resolve()
    if raw == target or raw.is_relative_to(target) or target.is_relative_to(raw):
        raise ValueError("Output directory must be separate from raw input")
    if out.exists() and (not out.is_dir() or set(p.name for p in out.iterdir()) - OUTPUT_NAMES):
        raise ValueError(
            "Output directory contains unrelated files; choose a dedicated results directory"
        )


def run_pipeline(
    data_dir=Path("data"), out=Path("results"), *, rules_path=DEFAULT_RULES, profile="generic"
):
    start = perf_counter()
    out = Path(out)
    _safe_output(data_dir, out)
    out.parent.mkdir(parents=True, exist_ok=True)
    lock_path = out.parent / f".{out.name}.pipeline.lock"
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise ValueError(
            f"Another pipeline holds {lock_path}; stop it before retrying. A stale lock may be removed only after checking the process."
        ) from exc
    os.write(lock_fd, str(os.getpid()).encode())
    os.close(lock_fd)
    try:
        dataset = load_dataset(Path(data_dir), profile=profile)
        rules = load_rules(rules_path)
        run_id, versions = identity(dataset.hashes, rules)
        graph = build_graph(dataset)
        clusters = assign_clusters(graph, rules)
        features = list(compute_features(graph, clusters, rules).values())
        nodes = [
            dict(f, **classify(f, p, rules))
            for f, p in zip(features, feature_percentiles(features))
        ]
        nodes = rank_nodes(nodes, rules)
        transfers = []
        by_node = {v: [] for v in graph}
        for src, dst, date, amount, row, ref in dataset.transactions[
            ["src", "dst", "date", "sum_tiyin", "source_row", "source_ref"]
        ].itertuples(index=False, name=None):
            tx = dict(
                src=str(src),
                dst=str(dst),
                date=date,
                sum_kzt=kzt(int(amount)),
                source_row=int(row),
                source_ref=ref,
            )
            transfers.append(tx)
            by_node[src].append(tx)
            by_node[dst].append(tx)
        explained = [explain_node(n, by_node[n["gid"]], run_id) for n in nodes]
        groups = cluster_summaries(explained, graph)
        snapshot = dict(
            schema_version="1",
            run_id=run_id,
            config=rules,
            audit=dataset.audit,
            nodes=explained,
            clusters=groups,
            transfers=transfers,
            edges=[
                dict(src=str(a), dst=str(b), sum_kzt=kzt(d["sum_tiyin"]), n_tx=d["n_tx"])
                for a, b, d in graph.edges(data=True)
            ],
        )
        snapshot["meta"] = dict(
            run_id=run_id,
            schema_version="1",
            config_version=rules["version"],
            algorithm_version=ALGORITHM_VERSION,
            counts=dict(
                nodes=len(nodes),
                edges=len(dataset.edges),
                transactions=len(transfers),
                seeds=int(dataset.nodes.is_seed.sum()),
                isolates=nx.number_of_isolates(graph),
                boundary=sum(n["boundary"] for n in nodes),
                clusters=len(groups),
            ),
            period=dict(start="2026-07-01", end="2026-07-31"),
            total_kzt=kzt(dataset.audit["total_tiyin"]),
            source_hashes=dataset.hashes,
            package_versions=versions,
            limitations=LIMITATIONS,
            features=dict(brief=True, removal=False, temporal=False, agent=False),
            generated_at=datetime.now(timezone.utc).isoformat(),
            duration_seconds=perf_counter() - start,
        )
        with tempfile.TemporaryDirectory(prefix=f".{out.name}-stage-", dir=out.parent) as temporary:
            stage = Path(temporary) / "new"
            stage.mkdir()
            _write_outputs(snapshot, stage)
            verify_outputs(data_dir, stage, rules_path=rules_path, profile=profile)
            # Include validation and complete CSV serialization in the recorded duration.
            snapshot["meta"]["duration_seconds"] = perf_counter() - start
            _write_outputs(snapshot, stage)
            backup = Path(temporary) / "previous"
            if out.exists():
                os.replace(out, backup)
            try:
                os.replace(stage, out)
            except BaseException:
                if backup.exists():
                    os.replace(backup, out)
                raise
        return snapshot
    finally:
        lock_path.unlink(missing_ok=True)


def verify_outputs(
    data_dir=Path("data"), out=Path("results"), *, rules_path=DEFAULT_RULES, profile="generic"
):
    out = Path(out)
    if not all((out / n).is_file() for n in OUTPUT_NAMES):
        raise ValueError("Incomplete results: expected three CSV, snapshot.json and manifest.json")
    manifest = json.loads((out / "manifest.json").read_text())
    for name in sorted(OUTPUT_NAMES - {"manifest.json"}):
        if (
            manifest.get("output_hashes", {}).get(name)
            != sha256((out / name).read_bytes()).hexdigest()
        ):
            raise ValueError(f"Output hash mismatch: {name}")
    snap = json.loads((out / "snapshot.json").read_text())
    ds = load_dataset(Path(data_dir), profile=profile)
    rules = load_rules(rules_path)
    run_id, _ = identity(ds.hashes, rules)
    if (
        snap.get("run_id") != run_id
        or manifest.get("run_id") != run_id
        or snap.get("config") != rules
    ):
        raise ValueError("Input/config/run_id mismatch")
    if (
        manifest.get("config_hash") != sha256(canonical_json(rules)).hexdigest()
        or manifest.get("source_hashes") != ds.hashes
    ):
        raise ValueError("Manifest source/config hash mismatch")
    nodes = snap["nodes"]
    ids = [n["gid"] for n in nodes]
    expected = {str(gid) for gid in ds.nodes.gid}
    if (
        len(ids) != len(set(ids))
        or set(ids) != expected
        or not all(isinstance(gid, str) for gid in ids)
    ):
        raise ValueError("Node set differs from raw identifiers")
    node_map = {n["gid"]: n for n in nodes}
    g = build_graph(ds)
    for node in nodes:
        gid = int(node["gid"])
        if node["role"] not in ROLE_NAMES or not 0 < len(node["evidence"]) <= 200:
            raise ValueError("Invalid node role/evidence")
        if not all(
            isinstance(node[k], (int, float)) and 0 <= node[k] <= 1
            for k in ("role_score", "priority_score")
        ):
            raise ValueError("Invalid node scores")
        if node["run_id"] != run_id or ("boundary" in node["flags"] and node["role"] == "terminal"):
            raise ValueError("Invalid node run/boundary role")
        if sum(d["sum_tiyin"] for _, _, d in g.in_edges(gid, data=True)) != parse_kzt(
            node["in_kzt"]
        ) or sum(d["sum_tiyin"] for _, _, d in g.out_edges(gid, data=True)) != parse_kzt(
            node["out_kzt"]
        ):
            raise ValueError(f"Node amounts differ from raw: {gid}")
        if (
            abs(
                sum(c["contribution"] for c in node["priority_contributions"])
                - node["priority_score"]
            )
            > 1e-12
        ):
            raise ValueError("Priority contributions do not sum to score")
    if ids != [
        n["gid"] for n in sorted(nodes, key=lambda n: (-n["priority_score"], int(n["gid"])))
    ]:
        raise ValueError("Node ranking is not canonical")
    for name, expected_rows in export_rows(snap).items():
        with (out / name).open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            actual = list(reader)
            if reader.fieldnames != CSV_COLUMNS[name]:
                raise ValueError(f"Invalid columns: {name}")
        if actual != [{k: str(v) for k, v in row.items()} for row in expected_rows]:
            raise ValueError(f"CSV/snapshot mismatch: {name}")
    groups = snap["clusters"]
    group_map = {c["cluster_id"]: c for c in groups}
    if len(group_map) != len(groups) or any(cid < 1 for cid in group_map):
        raise ValueError("Invalid cluster IDs")
    for cluster in groups:
        members = [n for n in nodes if n["cluster_id"] == cluster["cluster_id"]]
        internal = sum(
            d["sum_tiyin"]
            for a, b, d in g.edges(data=True)
            if node_map[str(a)]["cluster_id"]
            == cluster["cluster_id"]
            == node_map[str(b)]["cluster_id"]
        )
        if (
            cluster["n_nodes"] != len(members)
            or cluster["n_seed"] != sum(n["is_seed"] for n in members)
            or parse_kzt(cluster["sum_kzt_internal"]) != internal
        ):
            raise ValueError("Cluster statistics differ from raw")
        if cluster["top_gids"] != [n["gid"] for n in members[:3]]:
            raise ValueError("Invalid cluster top_gids")
    if sum(c["n_nodes"] for c in groups) != len(nodes) or sum(c["n_seed"] for c in groups) != int(
        ds.nodes.is_seed.sum()
    ):
        raise ValueError("Incomplete cluster assignment")
    if (
        len(snap["transfers"]) != len(ds.transactions)
        or parse_kzt(snap["meta"]["total_kzt"]) != ds.audit["total_tiyin"]
    ):
        raise ValueError("Transaction count/total differs from raw")
    return dict(
        status="valid",
        run_id=run_id,
        nodes=len(nodes),
        clusters=len(groups),
        top_nodes=min(rules["top_n"], len(nodes)),
    )
