"""Source-backed explanations and explicit limits of the observed graph."""

from collections import Counter, defaultdict
from decimal import Decimal

from app.roles import ROLE_NAMES

LIMITATIONS = [
    "Роли — проверяемые структурные гипотезы; score не является вероятностью виновности.",
    "Только внутрибанковские исходящие пути до четырёх колен, июль 2026, переводы от 5000 KZT.",
    "Входящие извне выборки и остатки неизвестны; разность потоков не является полным балансом.",
    "Дата имеет точность до дня; порядок операций внутри дня неизвестен.",
    "Размеченных ролей нет; accuracy, precision и recall на этом наборе не измерены.",
    "Seed-достижимость отражает топологию, а не происхождение конкретных денег.",
]
FLAG_TEXT = {
    "boundary": "Граница четвёртого колена; отсутствие выхода не доказывает накопление.",
    "isolated": "В срезе нет связей; отсутствие операций вне среза не установлено.",
    "seed_inflow_incomplete": "Seed: входящие из-за границ выборки неполны.",
    "out_exceeds_in": "Наблюдаемый выход больше входа; неизвестны внешние поступления и начальный остаток.",
    "low_observation": "Не более одной наблюдаемой операции; недостаточно устойчивых признаков.",
}
ROLE_LABELS = dict(
    consolidator="Признаки консолидации",
    distributor="Признаки распределения",
    transit="Признаки транзита",
    terminal="Наблюдаемый конец маршрута",
    coordinator="Структурный кандидат на координацию",
    peripheral="Нет специфической роли",
)


def kzt(tiyin: int) -> str:
    return f"{tiyin // 100}.{tiyin % 100:02d}"


def parse_kzt(value: str) -> int:
    whole, cents = value.split(".")
    if not whole.isdigit() or len(cents) != 2 or not cents.isdigit():
        raise ValueError("Expected nonnegative KZT decimal string with two digits")
    return int(whole) * 100 + int(cents)


def flags_for(node):
    tests = [
        ("boundary", node["boundary"]),
        ("isolated", node["isolated"]),
        ("seed_inflow_incomplete", node["is_seed"]),
        ("out_exceeds_in", node["out_tiyin"] > node["in_tiyin"]),
        ("low_observation", node["in_tx"] + node["out_tx"] <= 1),
    ]
    return [key for key, applies in tests if applies]


def explain_node(node, transfers, run_id):
    flags = flags_for(node)
    requests = []
    if node["isolated"]:
        requests.append(
            "Проверить отсутствие операций в заданном срезе и запросить расширение периода, банков и порога."
        )
    if node["boundary"]:
        requests.append(
            "Получить исходящие операции за пределами четвёртого колена, сохранив направление обхода."
        )
    if node["is_seed"] or (not node["in_tiyin"] and node["out_tiyin"] > 0):
        requests.append("Получить входящие операции из-за границ текущей выборки.")
    if node["out_tiyin"] > node["in_tiyin"]:
        requests.append(
            "Проверить недостающие входящие и остаток на начало периода; не трактовать разность как баланс."
        )
    if node["role"] == "terminal":
        requests.append("Запросить более поздний период и переводы за пределы банка.")
    if node["role"] == "coordinator":
        requests.append(
            "Проверить устойчивость связей во времени; структура сама по себе не доказывает управление."
        )
    if not requests:
        requests.append(
            "Запросить точное время операций и соседний период для проверки устойчивости паттерна."
        )
    evidence = (
        f"{ROLE_LABELS[node['role']]}. Вход {node['in_degree']}: {kzt(node['in_tiyin'])} KZT; "
        f"выход {node['out_degree']}: {kzt(node['out_tiyin'])} KZT; seed-путей {node['seed_reach_count']}."
    )
    if node["boundary"]:
        evidence += " Граница выгрузки."
    elif node["isolated"]:
        evidence += " Изолят в срезе."
    if len(evidence) > 200:
        raise ValueError("Evidence exceeds 200 characters; shorten the explanation template")
    relation = (
        f"выход/вход {Decimal(node['out_tiyin']) * 100 / Decimal(node['in_tiyin']):.1f}%"
        if node["in_tiyin"]
        else "вход не наблюдается; отношение не определено"
    )
    why = (
        f"{ROLE_LABELS[node['role']]}: {node['in_degree']} плательщиков, "
        f"{node['out_degree']} получателей; вход {kzt(node['in_tiyin'])} KZT, "
        f"выход {kzt(node['out_tiyin'])} KZT; {relation} (наблюдаемый срез). "
        f"Достижим от {node['seed_reach_count']} seed. "
        "Это отношение потоков, не остаток и не трассировка тех же денег."
    )
    if flags:
        why += " " + " ".join(FLAG_TEXT[flag] for flag in flags)
    detail = {
        k: v for k, v in node.items() if k not in {"in_tiyin", "out_tiyin", "isolated", "boundary"}
    }
    detail.update(
        gid=str(node["gid"]),
        run_id=run_id,
        in_kzt=kzt(node["in_tiyin"]),
        out_kzt=kzt(node["out_tiyin"]),
        flags=flags,
        evidence=evidence,
        limitations=[FLAG_TEXT[f] for f in flags] + LIMITATIONS,
        next_data_requests=requests,
        why=why,
        supporting_transfers={
            "total": len(transfers),
            "source_refs": [
                t["source_ref"]
                for t in sorted(
                    transfers, key=lambda t: (-parse_kzt(t["sum_kzt"]), t["source_row"])
                )[:5]
            ],
            "url": f"/api/v1/nodes/{node['gid']}/transfers",
        },
    )
    return detail


def cluster_summaries(nodes, graph):
    members = defaultdict(list)
    for node in nodes:
        members[node["cluster_id"]].append(node)
    cluster_of = {int(n["gid"]): n["cluster_id"] for n in nodes}
    totals = defaultdict(lambda: {"internal": 0, "in": 0, "out": 0})
    for src, dst, data in graph.edges(data=True):
        a, b = cluster_of[src], cluster_of[dst]
        if a == b:
            totals[a]["internal"] += data["sum_tiyin"]
        else:
            totals[a]["out"] += data["sum_tiyin"]
            totals[b]["in"] += data["sum_tiyin"]
    result = []
    for cluster, group in sorted(members.items()):
        roles = Counter(n["role"] for n in group)
        boundary = sum("boundary" in n["flags"] for n in group)
        leading = sorted(roles, key=lambda r: (-roles[r], r))[0]
        hypothesis = (
            "Изолированный узел в наблюдаемом срезе; данных для структурной гипотезы недостаточно."
            if len(group) == 1 and "isolated" in group[0]["flags"]
            else f"Гипотеза о связанной структуре: {len(group)} узлов; преобладает профиль «{ROLE_LABELS[leading]}» ({roles[leading]}). Кластер не доказывает общую организацию."
        )
        result.append(
            dict(
                cluster_id=cluster,
                n_nodes=len(group),
                n_seed=sum(n["is_seed"] for n in group),
                sum_kzt_internal=kzt(totals[cluster]["internal"]),
                top_gids=[n["gid"] for n in group[:3]],
                hypothesis=hypothesis,
                role_counts={r: roles[r] for r in ROLE_NAMES},
                boundary_count=boundary,
                cross_in_kzt=kzt(totals[cluster]["in"]),
                cross_out_kzt=kzt(totals[cluster]["out"]),
            )
        )
    return result
