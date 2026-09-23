"""Directed graph construction; original direction and exact integer money."""

import networkx as nx

from app.loader import Dataset


def build_graph(dataset: Dataset) -> nx.DiGraph:
    graph = nx.DiGraph()
    for gid, depth, is_seed in dataset.nodes[['gid', 'depth', 'is_seed']].itertuples(index=False, name=None):
        graph.add_node(int(gid), depth=int(depth), is_seed=bool(is_seed))
    for src, dst, amount, count in dataset.edges[['src', 'dst', 'sum_tiyin', 'n_tx']].itertuples(index=False, name=None):
        graph.add_edge(int(src), int(dst), sum_tiyin=int(amount), n_tx=int(count))
    return graph
