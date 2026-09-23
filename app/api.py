"""Read-only local API over a single validated, in-memory calculation."""

import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import networkx as nx
from fastapi import FastAPI, Query, Request
from fastapi import Path as ApiPath
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.exceptions import HTTPException

from app.assistant import AgentAnswer, AgentError, AgentQuery
from app.common_recipients import (
    CommonRecipientsArgs,
    CommonRecipientsResult,
    find_common_recipients,
)
from app.experiments import simulate_removal
from app.explain import ROLE_LABELS, kzt, parse_kzt
from app.pipeline import export_bytes as snapshot_export_bytes
from app.schemas import (
    ClusterDetail,
    ClusterPage,
    ClusterSummary,
    GraphResponse,
    NodeDetail,
    NodePage,
    NodeSummary,
    RemovalRequest,
    RemovalResponse,
    Role,
    Transfer,
    TransferPage,
)


class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        self.status, self.code, self.message, self.details = status, code, message, details or {}


def create_app(
    snapshot: dict, out: Path, web_dist: Path | None = None, *, assistant=None
) -> FastAPI:
    app = FastAPI(title="Neverlose · Граф денег", version="1", docs_url=None, redoc_url=None)
    run_id = snapshot["run_id"]
    nodes = [NodeDetail.model_validate(n).model_dump() for n in snapshot["nodes"]]
    by_gid = {n["gid"]: n for n in nodes}
    summaries = [{k: n[k] for k in NodeSummary.model_fields} for n in nodes]
    groups = [
        ClusterDetail.model_validate(dict(c, run_id=run_id)).model_dump()
        for c in snapshot["clusters"]
    ]
    by_cluster = {c["cluster_id"]: c for c in groups}
    transfers = defaultdict(list)
    for tx in snapshot["transfers"]:
        row = Transfer.model_validate(tx).model_dump()
        transfers[row["src"]].append(row)
        transfers[row["dst"]].append(row)
    for rows in transfers.values():
        rows.sort(key=lambda t: (t["date"], t["source_row"]))
    graph = nx.DiGraph()
    graph.add_nodes_from(by_gid)
    edges = []
    for edge in snapshot["edges"]:
        graph.add_edge(edge["src"], edge["dst"])
        edges.append(
            dict(
                id=f"e:{edge['src']}:{edge['dst']}",
                source="n:" + edge["src"],
                target="n:" + edge["dst"],
                sum_kzt=edge["sum_kzt"],
                n_tx=edge["n_tx"],
            )
        )
    # Freeze exports at server start: later pipeline runs cannot mix CSV with this run.
    export_bytes = snapshot_export_bytes(snapshot)

    def error_response(status, code, message, details=None):
        return JSONResponse(
            status_code=status,
            content={
                "error": {"code": code, "message": message, "details": details or {}},
                "run_id": run_id,
            },
        )

    @app.exception_handler(ApiError)
    async def known_error(request, exc):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(AgentError)
    async def assistant_error(request, exc):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        return error_response(
            422,
            "INVALID_PARAMETER",
            "Некорректные параметры запроса",
            {
                "errors": [
                    {"loc": list(e["loc"]), "type": e["type"], "message": e["msg"]}
                    for e in exc.errors()
                ]
            },
        )

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error_response(
            exc.status_code,
            "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR",
            "Ресурс не найден" if exc.status_code == 404 else "Запрос не поддерживается",
        )

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        return error_response(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера")

    def node(gid):
        if not re.fullmatch(r"[0-9]{1,19}", gid) or not 0 < int(gid) < 2**63:
            raise ApiError(422, "INVALID_GID", "gid должен быть точной десятичной строкой int64")
        if gid not in by_gid:
            raise ApiError(404, "NODE_NOT_FOUND", "Узел не найден")
        return by_gid[gid]

    def cluster(cid):
        if cid not in by_cluster:
            raise ApiError(404, "CLUSTER_NOT_FOUND", "Кластер не найден")
        return by_cluster[cid]

    @app.get("/health")
    def health():
        return dict(status="ready", schema_version="1", run_id=run_id)

    @app.get("/api/v1/meta")
    def meta():
        return dict(
            snapshot["meta"],
            features=dict(snapshot["meta"]["features"], agent=assistant is not None),
        )

    @app.post("/api/v1/agent/query", response_model=AgentAnswer)
    def agent_query(body: AgentQuery, request: Request):
        if assistant is None:
            raise ApiError(
                503,
                "AGENT_DISABLED",
                "Помощник выключен. Основной сценарий работает локально без API-ключа.",
            )
        origin = request.headers.get("origin")
        try:
            same_origin = not origin or (
                urlsplit(origin).netloc == request.url.netloc
                and urlsplit(origin).scheme == request.url.scheme
            )
        except ValueError:
            same_origin = False
        if request.url.hostname not in {"127.0.0.1", "localhost", "::1"} or not same_origin:
            raise ApiError(
                403,
                "AGENT_ORIGIN_DENIED",
                "Запрос помощнику разрешён только из локального рабочего места.",
            )
        if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
            raise ApiError(422, "INVALID_PARAMETER", "Требуется application/json.")
        if body.gid is not None:
            node(body.gid)
        return assistant.ask(body.question, body.gid)

    @app.get("/api/v1/analysis/common-recipients", response_model=CommonRecipientsResult)
    def common_recipients(
        gid: list[str] = Query(min_length=2, max_length=5),
        min_sources: int | None = Query(default=None, ge=2, le=5),
        limit: int = Query(default=10, ge=1, le=10),
    ):
        for value in gid:
            node(value)
        if len(set(gid)) != len(gid):
            raise ApiError(422, "DUPLICATE_GID", "Выберите разные gid")
        minimum = len(gid) if min_sources is None else min_sources
        if minimum > len(gid):
            raise ApiError(422, "INVALID_PARAMETER", "Порог превышает число выбранных отправителей")
        return find_common_recipients(
            snapshot, CommonRecipientsArgs(gids=gid, min_sources=minimum, limit=limit)
        )

    @lru_cache(maxsize=128)
    def removal_result(calculation_run: str, selected: tuple[str, ...]):
        return dict(run_id=calculation_run, **simulate_removal(graph, selected))

    @app.post("/api/v1/experiments/removal", response_model=RemovalResponse)
    def removal(body: RemovalRequest):
        if len(set(body.gids)) != len(body.gids):
            raise ApiError(422, "DUPLICATE_GID", "Выберите разные gid: повторы не допускаются")
        for gid in body.gids:
            node(gid)
        return removal_result(run_id, tuple(sorted(body.gids, key=int)))

    @app.get("/api/v1/nodes", response_model=NodePage)
    def list_nodes(
        role: Role | None = None,
        cluster_id: int | None = Query(None, ge=1),
        boundary: bool | None = None,
        is_seed: bool | None = None,
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
    ):
        matching = [
            n
            for n in summaries
            if (role is None or n["role"] == role)
            and (cluster_id is None or n["cluster_id"] == cluster_id)
            and (boundary is None or ("boundary" in n["flags"]) == boundary)
            and (is_seed is None or n["is_seed"] == is_seed)
        ]
        return dict(
            run_id=run_id,
            items=matching[offset : offset + limit],
            total=len(matching),
            offset=offset,
            limit=limit,
        )

    @app.get("/api/v1/nodes/{gid}", response_model=NodeDetail)
    def get_node(gid: str):
        return node(gid)

    @app.get("/api/v1/nodes/{gid}/transfers", response_model=TransferPage)
    def get_transfers(
        gid: str,
        direction: Literal["all", "in", "out"] = "all",
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
    ):
        node(gid)
        rows = [
            t
            for t in transfers[gid]
            if direction == "all" or t["dst" if direction == "in" else "src"] == gid
        ]
        incoming = sum(parse_kzt(t["sum_kzt"]) for t in rows if t["dst"] == gid)
        outgoing = sum(parse_kzt(t["sum_kzt"]) for t in rows if t["src"] == gid)
        return dict(
            run_id=run_id,
            items=rows[offset : offset + limit],
            total=len(rows),
            offset=offset,
            limit=limit,
            direction=direction,
            sum_kzt=kzt(incoming + outgoing),
            in_kzt=kzt(incoming),
            out_kzt=kzt(outgoing),
        )

    @app.get("/api/v1/clusters", response_model=ClusterPage)
    def list_clusters():
        return dict(
            run_id=run_id, items=[{k: c[k] for k in ClusterSummary.model_fields} for c in groups]
        )

    @app.get("/api/v1/clusters/{cluster_id}", response_model=ClusterDetail)
    def get_cluster(cluster_id: int = ApiPath(ge=1)):
        return cluster(cluster_id)

    @app.get("/api/v1/graph", response_model=GraphResponse)
    def get_graph(
        mode: Literal["overview", "ego", "cluster"] = "overview",
        gid: str | None = None,
        cluster_id: int | None = Query(None, ge=1),
        hops: int = Query(1, ge=1, le=2),
        limit: int = Query(250, ge=1, le=1000),
    ):
        scope = {"mode": mode}
        if mode == "overview":
            all_nodes = [
                dict(
                    id=f"c:{c['cluster_id']}",
                    kind="cluster",
                    gid=None,
                    cluster_id=c["cluster_id"],
                    label=f"Кластер {c['cluster_id']}",
                    role=None,
                    priority_score=None,
                    boundary=c["boundary_count"] > 0,
                    is_seed=c["n_seed"] > 0,
                    n_nodes=c["n_nodes"],
                )
                for c in groups
            ]
            aggregate = defaultdict(lambda: [0, 0])
            for e in snapshot["edges"]:
                a, b = by_gid[e["src"]]["cluster_id"], by_gid[e["dst"]]["cluster_id"]
                if a != b:
                    aggregate[(a, b)][0] += parse_kzt(e["sum_kzt"])
                    aggregate[(a, b)][1] += e["n_tx"]
            all_edges = [
                dict(
                    id=f"ce:{a}:{b}", source=f"c:{a}", target=f"c:{b}", sum_kzt=kzt(v[0]), n_tx=v[1]
                )
                for (a, b), v in sorted(aggregate.items())
            ]
        else:
            if mode == "ego":
                if gid is None:
                    raise ApiError(422, "MISSING_GID", "Для ego-графа нужен gid")
                node(gid)
                distances = nx.single_source_shortest_path_length(
                    graph.to_undirected(as_view=True), gid, cutoff=hops
                )
                matching = sorted(
                    distances,
                    key=lambda key: (distances[key], -by_gid[key]["priority_score"], int(key)),
                )
                scope.update(gid=gid, hops=hops)
            else:
                if cluster_id is None:
                    raise ApiError(422, "MISSING_CLUSTER", "Для графа кластера нужен cluster_id")
                cluster(cluster_id)
                matching = [n["gid"] for n in nodes if n["cluster_id"] == cluster_id]
                scope.update(cluster_id=cluster_id)
            all_nodes = [
                dict(
                    id="n:" + key,
                    kind="node",
                    gid=key,
                    cluster_id=by_gid[key]["cluster_id"],
                    label=key,
                    role=by_gid[key]["role"],
                    priority_score=by_gid[key]["priority_score"],
                    boundary="boundary" in by_gid[key]["flags"],
                    is_seed=by_gid[key]["is_seed"],
                    n_nodes=1,
                )
                for key in matching
            ]
            matched_ids = {n["id"] for n in all_nodes}
            all_edges = [
                e for e in edges if e["source"] in matched_ids and e["target"] in matched_ids
            ]
        shown = all_nodes[:limit]
        shown_ids = {n["id"] for n in shown}
        shown_edges = [
            e for e in all_edges if e["source"] in shown_ids and e["target"] in shown_ids
        ]
        return dict(
            run_id=run_id,
            scope=scope,
            nodes=shown,
            edges=shown_edges,
            counts=dict(
                matched_nodes=len(all_nodes),
                shown_nodes=len(shown),
                matched_edges=len(all_edges),
                shown_edges=len(shown_edges),
            ),
            truncated=len(shown) < len(all_nodes),
        )

    @app.get("/api/v1/exports/{name}")
    def export(name: str):
        if name not in export_bytes:
            raise ApiError(
                404, "EXPORT_NOT_FOUND", "Доступны только три опубликованные CSV-выгрузки"
            )
        return Response(
            export_bytes[name],
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{name}"', "X-Run-Id": run_id},
        )

    @app.get("/api/v1/nodes/{gid}/brief")
    def brief(gid: str):
        n = node(gid)
        text = f"# Аналитическая справка: {gid}\n\nRun: `{run_id}`\n\nГипотеза: {ROLE_LABELS[n['role']]}.\n\n{n['evidence']}\n\nСила правила: {n['role_score']:.6f}; приоритет: {n['priority_score']:.6f}. Это не вероятности.\n\n## Условия основного правила\n\n"
        chosen = next(c for c in n["candidates"] if c["role"] == n["role"])
        text += "\n".join(
            f"- {c['text']}: {c['actual']} {c['operator']} {c['threshold']}; {'выполнено' if c['passed'] else 'не выполнено'}."
            for c in chosen["checks"]
        )
        text += "\n\n## Исходные строки\n\n" + "\n".join(
            "- " + ref for ref in n["supporting_transfers"]["source_refs"]
        )
        text += (
            f"\n\nВсего связанных переводов: {n['supporting_transfers']['total']}. Локальные ссылки, не банковские ID.\n\n## Ограничения\n\n"
            + "\n".join("- " + s for s in n["limitations"])
        )
        text += (
            "\n\n## Следующий запрос данных\n\n"
            + "\n".join("- " + s for s in n["next_data_requests"])
            + "\n"
        )
        return Response(
            text,
            media_type="text/markdown",
            headers={
                "X-Run-Id": run_id,
                "Content-Disposition": f'attachment; filename="node-{gid}.md"',
            },
        )

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/") or path == "health":
            raise ApiError(404, "NOT_FOUND", "Ресурс не найден")
        if web_dist is None or not (Path(web_dist) / "index.html").is_file():
            raise ApiError(
                503,
                "UI_NOT_BUILT",
                "Сборка интерфейса отсутствует; выполните npm ci и npm run build в web",
            )
        root = Path(web_dist).resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise ApiError(404, "NOT_FOUND", "Ресурс не найден")
        if target.is_file():
            return FileResponse(target)
        if "." in Path(path).name:
            raise ApiError(404, "NOT_FOUND", "Ресурс не найден")
        return FileResponse(root / "index.html")

    return app
