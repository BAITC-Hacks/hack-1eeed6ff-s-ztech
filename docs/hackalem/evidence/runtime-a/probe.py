"""Measure a running local API; never starts or changes the application."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
import platform
import random
import subprocess
from time import perf_counter
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    def fetch(path):
        with urlopen(args.base_url + path, timeout=10) as response:
            assert response.status == 200
            return response.read(), dict(response.headers)

    meta = json.loads(fetch("/api/v1/meta")[0])
    run_id = meta["run_id"]
    all_nodes = []
    offset = 0
    while True:
        page = json.loads(fetch(f"/api/v1/nodes?limit=200&offset={offset}")[0])
        assert page["run_id"] == run_id
        all_nodes.extend(page["items"])
        offset += len(page["items"])
        if offset == page["total"]:
            break
        assert page["items"], "Pagination stopped before reported total"
    assert len({n["gid"] for n in all_nodes}) == len(all_nodes)
    rng = random.Random(42)
    selected = list(dict.fromkeys(
        [n["gid"] for n in all_nodes[:12]]
        + [n["gid"] for n in rng.sample(all_nodes, min(24, len(all_nodes)))]
        + [next(n["gid"] for n in all_nodes if "isolated" in n["flags"])]
        + [next(n["gid"] for n in all_nodes if "boundary" in n["flags"])]
    ))
    exports = ["nodes_roles.csv", "clusters.csv", "top_nodes.csv"]

    def csv_hashes():
        hashes = {}
        for name in exports:
            body, headers = fetch("/api/v1/exports/" + name)
            assert headers["x-run-id"] == run_id
            hashes[name] = sha256(body).hexdigest()
        return hashes

    before = csv_hashes()
    requests = [
        (kind, gid, path)
        for gid in selected
        for kind, path in [
            ("card", f"/api/v1/nodes/{gid}"),
            ("ego_1_hop", f"/api/v1/graph?mode=ego&gid={gid}&hops=1&limit=250"),
            ("ego_2_hops", f"/api/v1/graph?mode=ego&gid={gid}&hops=2&limit=1000"),
        ]
    ]

    def measure(request):
        kind, gid, path = request
        start = perf_counter()
        raw, _ = fetch(path)
        elapsed = (perf_counter() - start) * 1000
        value = json.loads(raw)
        assert value["run_id"] == run_id
        if kind == "card":
            assert value["gid"] == gid
        else:
            assert gid in {n["gid"] for n in value["nodes"]}
            ids = {n["id"] for n in value["nodes"]}
            assert all(e["source"] in ids and e["target"] in ids for e in value["edges"])
        return {"kind": kind, "gid": gid, "http_ms": elapsed, "bytes": len(raw)}

    # Warm one request of each type; measurements include TCP/HTTP and complete body,
    # but exclude JSON parsing, browser rendering, pipeline and dependency startup.
    for request in requests[:3]:
        measure(request)
    serial = list(map(measure, requests))
    with ThreadPoolExecutor(max_workers=4) as pool:
        concurrent = list(pool.map(measure, requests))
    after = csv_hashes()
    assert before == after

    def summary(rows):
        result = {}
        for kind in ("card", "ego_1_hop", "ego_2_hops"):
            times = sorted(r["http_ms"] for r in rows if r["kind"] == kind)
            result[kind] = {
                "requests": len(times),
                "p50_ms": round(times[math.ceil(len(times) * 0.5) - 1], 3),
                "p95_ms": round(times[math.ceil(len(times) * 0.95) - 1], 3),
                "max_ms": round(max(times), 3),
            }
        return result

    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "run_id": run_id,
        "platform": platform.platform(),
        "python": platform.python_version(),
        "node_selection": "First 12 priority nodes, random sample 24 with seed42, first isolate and boundary; deduplicated.",
        "gids": selected,
        "serial": summary(serial),
        "concurrency_4": summary(concurrent),
        "csv_sha256_before_and_after": before,
        "limitations": [
            "Local HTTP loopback; one M4/16GiB laptop; warm process.",
            "Concurrent reviewer activity may affect timings; no hardware isolation.",
            "HTTP and complete body only, not browser rendering or click-to-paint.",
            "No cross-platform, million-node, sustained load or SLA claim.",
        ],
        "samples": {"serial": serial, "concurrency_4": concurrent},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ("serial", "concurrency_4", "run_id")}, indent=2))


if __name__ == "__main__":
    main()
