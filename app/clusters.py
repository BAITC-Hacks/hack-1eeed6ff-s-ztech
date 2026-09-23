"""Deterministic Louvain communities, preserving reciprocals and isolated nodes."""

import networkx as nx


def undirected_projection(graph: nx.DiGraph) -> nx.Graph:
    projection = nx.Graph()
    projection.add_nodes_from(sorted(graph))
    for src, dst, data in sorted(graph.edges(data=True)):
        previous = projection.get_edge_data(src, dst, {}).get("sum_tiyin", 0)
        projection.add_edge(src, dst, sum_tiyin=previous + data["sum_tiyin"])
    return projection


def assign_clusters(graph: nx.DiGraph, rules: dict) -> dict[int, int]:
    projection = undirected_projection(graph)
    isolates = list(nx.isolates(projection))
    connected = projection.subgraph([v for v in projection if projection.degree(v) > 0]).copy()
    groups = [{v} for v in isolates]
    if connected.number_of_edges():
        communities = nx.community.louvain_communities(
            connected, weight="sum_tiyin", **rules["louvain"]
        )
        for community in communities:
            groups.extend(set(c) for c in nx.connected_components(connected.subgraph(community)))
    groups.sort(key=lambda group: (-len(group), min(group)))
    return {v: cluster for cluster, group in enumerate(groups, 1) for v in sorted(group)}
