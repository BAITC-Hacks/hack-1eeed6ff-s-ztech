"""Published role hypotheses. Raw eligibility selects a role before score caps."""

import json
import math
from bisect import bisect_right
from pathlib import Path

DEFAULT_RULES = Path(__file__).resolve().parents[1] / "config/rules.json"
ROLE_NAMES = ("consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral")


def load_rules(path=DEFAULT_RULES):
    rules = json.loads(Path(path).read_text())
    for name in ROLE_NAMES[:-1]:
        weights = rules["roles"][name]["weights"]
        if not all(math.isfinite(w) and 0 <= w <= 1 for w in weights) or not math.isclose(
            sum(weights), 1
        ):
            raise ValueError(f"Invalid role weights: {name}")
    keys = ("turnover", "betweenness", "seed_reach", "degree", "participation")
    if not math.isclose(sum(rules["priority"][k] for k in keys), 1):
        raise ValueError("Priority weights must sum to one")
    if set(rules["tie_break"]) != set(ROLE_NAMES[:-1]) or len(rules["tie_break"]) != 5:
        raise ValueError("Invalid role tie_break")
    if rules["top_n"] < 20:
        raise ValueError("top_n must be at least 20")
    return rules


def clip(value):
    return min(1.0, max(0.0, value))


def positive_percentiles(values):
    positive = sorted(x for x in values if x > 0)
    return [
        bisect_right(positive, x) / len(positive) if x > 0 and positive else 0.0 for x in values
    ]


def feature_percentiles(features):
    fields = ["in_tiyin", "out_tiyin", "in_degree", "out_degree", "betweenness", "pagerank"]
    vectors = {k: [f[k] for f in features] for k in fields}
    vectors["min_flow"] = [min(f["in_tiyin"], f["out_tiyin"]) for f in features]
    vectors["turnover"] = [f["in_tiyin"] + f["out_tiyin"] for f in features]
    ranked = {key: positive_percentiles(values) for key, values in vectors.items()}
    return [{key: values[i] for key, values in ranked.items()} for i in range(len(features))]


def classify(feature, p, rules):
    f, rr = feature, rules["roles"]
    a, b, s, ratio = f["in_degree"], f["out_degree"], f["seed_reach_count"], f["observed_ratio"]

    def check(key, actual, operator, threshold, text):
        operations = {
            ">=": lambda: actual >= threshold,
            "<=": lambda: actual <= threshold,
            ">": lambda: actual > threshold,
            "<": lambda: actual < threshold,
            "==": lambda: actual == threshold,
        }
        passed = actual is not None and operations[operator]()
        return dict(
            key=key,
            actual=actual,
            operator=operator,
            threshold=threshold,
            passed=bool(passed),
            text=text,
        )

    checks = {}
    checks["consolidator"] = [
        check(
            "in_degree",
            a,
            ">=",
            rr["consolidator"]["min_in_degree"],
            "Несколько наблюдаемых плательщиков",
        )
    ]
    checks["distributor"] = [
        check(
            "out_degree",
            b,
            ">=",
            rr["distributor"]["min_out_degree"],
            "Веер наблюдаемых получателей",
        )
    ]
    checks["transit"] = [
        check("is_seed", int(f["is_seed"]), "==", 0, "Не исходный seed"),
        check("boundary", int(f["boundary"]), "==", 0, "Не граница выгрузки"),
        check("in_degree", a, ">=", 1, "Есть входящие связи"),
        check("out_degree", b, ">=", 1, "Есть исходящие связи"),
        check("positive_inflow", int(f["in_tiyin"] > 0), "==", 1, "Положительный наблюдаемый вход"),
        check(
            "observed_ratio",
            ratio,
            ">=",
            rr["transit"]["ratio_min"],
            "Нижняя граница отношения выход/вход",
        ),
        check(
            "observed_ratio",
            ratio,
            "<=",
            rr["transit"]["ratio_max"],
            "Верхняя граница отношения выход/вход",
        ),
    ]
    checks["terminal"] = [
        check("is_seed", int(f["is_seed"]), "==", 0, "Не исходный seed"),
        check(
            "depth",
            f["depth"],
            "<",
            rr["terminal"]["max_depth_exclusive"],
            "До границы четвёртого колена",
        ),
        check("in_degree", a, ">=", 1, "Есть входящие связи"),
        check("out_degree", b, "==", 0, "В срезе нет исходящих связей"),
        check("positive_inflow", int(f["in_tiyin"] > 0), "==", 1, "Положительный наблюдаемый вход"),
    ]
    rc = rr["coordinator"]
    checks["coordinator"] = [
        check("depth", f["depth"], "<", rc["max_depth_exclusive"], "До границы выгрузки"),
        check("in_degree", a, ">=", rc["min_in_degree"], "Несколько входящих связей"),
        check("out_degree", b, ">=", rc["min_out_degree"], "Несколько исходящих связей"),
        check("seed_reach_count", s, ">=", rc["min_seed_reach"], "Достижим от разных seed"),
        check(
            "participation",
            f["participation"],
            ">=",
            rc["min_participation"],
            "Оборот распределён между кластерами",
        ),
        check(
            "betweenness_percentile",
            p["betweenness"],
            ">=",
            rc["min_betweenness_percentile"],
            "Высокий относительный ранг посредничества",
        ),
    ]
    factors = {
        "consolidator": [
            clip(a / rr["consolidator"]["degree_scale"]),
            p["in_tiyin"],
            clip(s / rr["consolidator"]["seed_scale"]),
        ],
        "distributor": [clip(b / rr["distributor"]["degree_scale"]), p["out_tiyin"]],
        "transit": [
            clip(1 - abs(1 - ratio) / rr["transit"]["ratio_width"]) if ratio is not None else 0.0,
            clip(min(a, b) / rr["transit"]["degree_scale"]),
            p["min_flow"],
        ],
        "terminal": [1.0, p["in_tiyin"], clip(a / rr["terminal"]["degree_scale"])],
        "coordinator": [
            p["betweenness"],
            f["participation"],
            clip(s / rc["seed_scale"]),
            p["pagerank"],
        ],
    }
    candidates = []
    caps_by_role = {}
    for role in rules["tie_break"]:
        eligible = all(c["passed"] for c in checks[role]) and not f["isolated"]
        raw = sum(w * x for w, x in zip(rr[role]["weights"], factors[role]))
        caps = score_caps(f, role, rules)
        caps_by_role[role] = caps
        capped = min([raw] + [c["cap"] for c in caps])
        candidates.append(
            dict(
                role=role,
                eligible=eligible,
                raw_score=raw,
                capped_score=capped,
                checks=checks[role],
            )
        )
    eligible = sorted(
        (c for c in candidates if c["eligible"]),
        key=lambda c: (-c["raw_score"], rules["tie_break"].index(c["role"])),
    )
    fallback = not eligible
    raw = 0.0 if f["isolated"] else rr["peripheral"]["observed_score"]
    peripheral = dict(
        role="peripheral",
        eligible=fallback,
        raw_score=raw,
        capped_score=raw,
        checks=[
            check(
                "eligible_specific_roles",
                len(eligible),
                "==",
                0,
                "Нет допустимой более конкретной роли",
            )
        ],
    )
    candidates.append(peripheral)
    chosen = eligible[0] if eligible else peripheral
    return dict(
        role=chosen["role"],
        raw_score=chosen["raw_score"],
        role_score=chosen["capped_score"],
        role_rule_id=f"{rules['version']}:{chosen['role']}",
        candidates=candidates,
        score_caps=caps_by_role.get(chosen["role"], score_caps(f, "peripheral", rules)),
        alternative=eligible[1] if len(eligible) > 1 else None,
    )


def score_caps(f, role, rules):
    applicable = []
    for condition, key, reason in [
        (role == "coordinator", "coordinator", "Структура не устанавливает управление"),
        (role == "terminal", "terminal", "Нет полной банковской картины"),
        (f["boundary"], "boundary", "Граница выгрузки"),
        (f["is_seed"], "seed", "Входящие seed неполны"),
        (f["in_tx"] + f["out_tx"] <= 1, "low_observation", "Не более одной наблюдаемой операции"),
    ]:
        if condition:
            applicable.append(dict(key=key, cap=rules["caps"][key], reason=reason))
    return applicable
