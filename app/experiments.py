"""Read-only structural sensitivity of the complete observed graph."""

import networkx as nx

REMOVAL_LIMITATIONS = [
    "Связность считается без учёта направления переводов.",
    "Сравниваются только оставшиеся узлы; удаляемые узлы не входят в знаменатель.",
    "Это структурная симуляция, не прогноз предотвращённых потерь и не банковское действие.",
]


def simulate_removal(graph: nx.DiGraph, gids: list[str] | tuple[str, ...]) -> dict:
    """Compare the same remaining vertex pairs before and after removing 1–3 nodes."""
    if not 1 <= len(gids) <= 3 or len(set(gids)) != len(gids):
        raise ValueError("Select 1–3 distinct nodes")
    if any(gid not in graph for gid in gids):
        raise ValueError("Unknown node")
    remaining = set(graph) - set(gids)
    count = len(remaining)

    def metrics(sizes):
        sizes = [size for size in sizes if size]
        largest = max(sizes, default=0)
        return dict(
            components=len(sizes),
            largest_component_size=largest,
            largest_component_fraction=largest / count if count else None,
            connected_pairs=sum(size * (size - 1) // 2 for size in sizes),
        )

    # A removed bridge may still connect remaining endpoints in the baseline.
    before = metrics(
        len(component & remaining) for component in nx.weakly_connected_components(graph)
    )
    reduced = graph.subgraph(remaining)
    after = metrics(len(component) for component in nx.weakly_connected_components(reduced))
    affected = before["connected_pairs"] - after["connected_pairs"]
    return dict(
        method="weak_components_remaining_nodes",
        removed_gids=sorted(gids, key=int),
        remaining_nodes=count,
        removed_edges=graph.number_of_edges() - reduced.number_of_edges(),
        before=before,
        after=after,
        affected_pairs=affected,
        affected_pairs_fraction=affected / before["connected_pairs"]
        if before["connected_pairs"]
        else None,
        limitations=list(REMOVAL_LIMITATIONS),
    )
