"""Contract v1: exact identifiers and money are strings on every JSON boundary."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Gid = Annotated[str, StringConstraints(strict=True, pattern=r"^[0-9]{1,19}$")]
Kzt = Annotated[str, StringConstraints(strict=True, pattern=r"^[0-9]+\.[0-9]{2}$")]
Score = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Role = Literal["consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral"]
Flag = Literal[
    "boundary", "isolated", "seed_inflow_incomplete", "out_exceeds_in", "low_observation"
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class RuleCheck(Contract):
    key: str
    actual: float | None
    operator: str
    threshold: float | None
    passed: bool
    text: str


class Contribution(Contract):
    key: str
    label: str
    raw: float
    normalized: Score
    weight: Score
    contribution: Score


class Candidate(Contract):
    role: Role
    eligible: bool
    raw_score: Score
    capped_score: Score
    checks: list[RuleCheck]


class ScoreCap(Contract):
    key: str
    cap: Score
    reason: str


class SupportingTransfers(Contract):
    total: int = Field(ge=0)
    source_refs: list[str]
    url: str


class NodeSummary(Contract):
    gid: Gid
    role: Role
    role_score: Score
    cluster_id: int = Field(ge=1)
    priority_score: Score
    evidence: str = Field(min_length=1, max_length=200)
    depth: int = Field(ge=0, le=4)
    is_seed: bool
    flags: list[Flag]

    @field_validator("gid")
    @classmethod
    def int64_gid(cls, value):
        if not 0 < int(value) < 2**63:
            raise ValueError("gid outside positive int64 range")
        return value


class NodeDetail(NodeSummary):
    run_id: str
    in_degree: int = Field(ge=0)
    out_degree: int = Field(ge=0)
    in_kzt: Kzt
    out_kzt: Kzt
    in_tx: int = Field(ge=0)
    out_tx: int = Field(ge=0)
    observed_ratio: float | None
    seed_reach_count: int = Field(ge=0)
    pagerank: float
    betweenness: float
    participation: Score
    role_rule_id: str
    candidates: list[Candidate]
    priority_contributions: list[Contribution]
    limitations: list[str]
    next_data_requests: list[str]
    raw_score: Score
    score_caps: list[ScoreCap]
    supporting_transfers: SupportingTransfers
    alternative: Candidate | None
    why: str = ""


class NodePage(Contract):
    run_id: str
    items: list[NodeSummary]
    total: int
    offset: int
    limit: int


class Transfer(Contract):
    source_ref: str
    source_row: int = Field(ge=0)
    src: Gid
    dst: Gid
    date: str
    sum_kzt: Kzt


class TransferPage(Contract):
    run_id: str
    items: list[Transfer]
    total: int
    offset: int
    limit: int
    direction: Literal["all", "in", "out"]
    sum_kzt: Kzt
    in_kzt: Kzt
    out_kzt: Kzt


class ClusterSummary(Contract):
    cluster_id: int = Field(ge=1)
    n_nodes: int = Field(ge=1)
    n_seed: int = Field(ge=0)
    sum_kzt_internal: Kzt
    top_gids: list[Gid]
    hypothesis: str


class ClusterDetail(ClusterSummary):
    run_id: str
    role_counts: dict[Role, int]
    boundary_count: int
    cross_in_kzt: Kzt
    cross_out_kzt: Kzt


class ClusterPage(Contract):
    run_id: str
    items: list[ClusterSummary]


class GraphNode(Contract):
    id: str
    kind: Literal["node", "cluster"]
    gid: Gid | None
    cluster_id: int
    label: str
    role: Role | None
    priority_score: Score | None
    boundary: bool
    is_seed: bool
    n_nodes: int


class GraphEdge(Contract):
    id: str
    source: str
    target: str
    sum_kzt: Kzt
    n_tx: int


class GraphResponse(Contract):
    run_id: str
    scope: dict[str, str | int | None]
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    counts: dict[str, int]
    truncated: bool


class RemovalRequest(Contract):
    gids: list[Gid] = Field(min_length=1, max_length=3)


class ConnectivityMetrics(Contract):
    components: int = Field(ge=0)
    largest_component_size: int = Field(ge=0)
    largest_component_fraction: Score | None
    connected_pairs: int = Field(ge=0)


class RemovalResponse(Contract):
    run_id: str
    method: Literal["weak_components_remaining_nodes"]
    removed_gids: list[Gid]
    remaining_nodes: int = Field(ge=0)
    removed_edges: int = Field(ge=0)
    before: ConnectivityMetrics
    after: ConnectivityMetrics
    affected_pairs: int = Field(ge=0)
    affected_pairs_fraction: Score | None
    limitations: list[str]
