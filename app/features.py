"""Directed graph construction; original direction and exact integer money."""

import networkx as nx

from app.loader import Dataset


def build_graph(dataset: Dataset) -> nx.DiGraph:
    graph = nx.DiGraph()
    for gid, depth, is_seed in dataset.nodes[["gid", "depth", "is_seed"]].itertuples(
        index=False, name=None
    ):
        graph.add_node(int(gid), depth=int(depth), is_seed=bool(is_seed))
    for src, dst, amount, count in dataset.edges[["src", "dst", "sum_tiyin", "n_tx"]].itertuples(
        index=False, name=None
    ):
        graph.add_edge(int(src), int(dst), sum_tiyin=int(amount), n_tx=int(count))
    return graph


def compute_features(graph: nx.DiGraph, clusters: dict[int, int], rules: dict) -> dict[int, dict]:
    pagerank = nx.pagerank(graph, weight="sum_tiyin", **rules["pagerank"])
    between = nx.betweenness_centrality(
        graph,
        k=min(rules["betweenness"]["sample_size"], len(graph)),
        weight=None,
        normalized=True,
        seed=rules["betweenness"]["seed"],
    )
    reaches = dict.fromkeys(graph, 0)
    for seed in graph:
        if graph.nodes[seed]["is_seed"]:
            for target in nx.single_source_shortest_path_length(
                graph, seed, cutoff=rules["seed_max_hops"]
            ):
                if target != seed:
                    reaches[target] += 1
    result = {}
    for gid in graph:
        incoming = list(graph.in_edges(gid, data=True))
        outgoing = list(graph.out_edges(gid, data=True))
        total_in = sum(d["sum_tiyin"] for _, _, d in incoming)
        total_out = sum(d["sum_tiyin"] for _, _, d in outgoing)
        by_cluster = {}
        for src, _, data in incoming:
            c = clusters[src]
            by_cluster[c] = by_cluster.get(c, 0) + data["sum_tiyin"]
        for _, dst, data in outgoing:
            c = clusters[dst]
            by_cluster[c] = by_cluster.get(c, 0) + data["sum_tiyin"]
        total = total_in + total_out
        participation = (
            1 - sum((w / total) ** 2 for _, w in sorted(by_cluster.items())) if total else 0.0
        )
        result[gid] = dict(
            gid=gid,
            **graph.nodes[gid],
            cluster_id=clusters[gid],
            in_degree=len(incoming),
            out_degree=len(outgoing),
            in_tiyin=total_in,
            out_tiyin=total_out,
            in_tx=sum(d["n_tx"] for _, _, d in incoming),
            out_tx=sum(d["n_tx"] for _, _, d in outgoing),
            observed_ratio=total_out / total_in if total_in else None,
            seed_reach_count=reaches[gid],
            pagerank=pagerank[gid],
            betweenness=between[gid],
            participation=max(0.0, min(1.0, participation)),
            boundary=graph.nodes[gid]["depth"] == 4 and not outgoing,
            isolated=not incoming and not outgoing,
        )
    return result
