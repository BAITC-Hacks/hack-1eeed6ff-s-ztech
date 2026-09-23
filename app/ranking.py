"""A relative review priority, not a probability and not a verdict."""

from app.roles import clip, feature_percentiles


def rank_nodes(nodes, rules):
    percentiles = feature_percentiles(nodes)
    result = []
    for node, p in zip(nodes, percentiles):
        definitions = [
            (
                "turnover",
                "Наблюдаемый оборот",
                (node["in_tiyin"] + node["out_tiyin"]) / 100,
                p["turnover"],
            ),
            ("betweenness", "Посредническая центральность", node["betweenness"], p["betweenness"]),
            (
                "seed_reach",
                "Достижимость от seed",
                node["seed_reach_count"],
                clip(node["seed_reach_count"] / rules["priority"]["seed_scale"]),
            ),
            (
                "degree",
                "Число контрагентов",
                max(node["in_degree"], node["out_degree"]),
                max(p["in_degree"], p["out_degree"]),
            ),
            (
                "participation",
                "Связи между кластерами",
                node["participation"],
                node["participation"],
            ),
        ]
        contributions = [
            dict(
                key=k,
                label=label,
                raw=raw,
                normalized=0.0 if node["isolated"] else norm,
                weight=rules["priority"][k],
                contribution=0.0 if node["isolated"] else norm * rules["priority"][k],
            )
            for k, label, raw, norm in definitions
        ]
        result.append(
            dict(
                node,
                priority_score=sum(c["contribution"] for c in contributions),
                priority_contributions=contributions,
            )
        )
    return sorted(result, key=lambda n: (-n["priority_score"], n["gid"]))
