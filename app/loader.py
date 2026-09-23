"""Validate raw tables without rounding IDs, deleting payments, or repairing data."""

import json
from dataclasses import dataclass
from decimal import Decimal
from hashlib import sha256
from pathlib import Path

import pandas as pd
from pandas.api.types import is_bool_dtype, is_float_dtype, is_integer_dtype

COLUMNS = {
    "nodes": ["gid", "depth", "is_seed"],
    "edges": ["src", "dst", "sum_kzt", "n_tx", "depth"],
    "transactions": ["src", "dst", "date", "sum_kzt"],
}


class DataValidationError(ValueError):
    """An actionable input error; no new result should be activated."""


@dataclass
class Dataset:
    nodes: pd.DataFrame
    edges: pd.DataFrame
    transactions: pd.DataFrame
    hashes: dict[str, str]
    audit: dict


def _integer(frame, col, name, minimum=0, maximum=2**63 - 1):
    values = frame[col]
    if not is_integer_dtype(values.dtype) or is_bool_dtype(values.dtype):
        raise DataValidationError(f"{name}.{col}: exact integer column required")
    if not values.between(minimum, maximum).all():
        raise DataValidationError(f"{name}.{col}: integer out of range [{minimum}, {maximum}]")


def _money(frame, name):
    values = frame["sum_kzt"]
    if not (is_integer_dtype(values.dtype) or is_float_dtype(values.dtype)) or is_bool_dtype(
        values.dtype
    ):
        raise DataValidationError(f"{name}.sum_kzt: numeric amounts required")
    amounts = []
    for row, value in enumerate(values):
        # Convert the source decimal representation before scaling: float * 100
        # can lose tiyin even when the source is an exactly represented integer.
        scaled = (
            Decimal(int(value) * 100)
            if is_integer_dtype(values.dtype) or float(value).is_integer()
            else Decimal(str(value)) * 100
        )
        if not scaled.is_finite():
            raise DataValidationError(f"{name}.sum_kzt: amounts must be finite")
        if scaled <= 0:
            raise DataValidationError(f"{name}.sum_kzt: amounts must be positive")
        rounded = scaled.to_integral_value()
        if abs(scaled - rounded) > Decimal("0.000001"):
            raise DataValidationError(f"{name}.sum_kzt: precision exceeds one tiyin at row {row}")
        if rounded >= 2**63:
            raise DataValidationError(f"{name}.sum_kzt: amount exceeds supported int64 tiyin range")
        amounts.append(int(rounded))
    # Python integers keep all later sums exact, including totals beyond int64.
    frame["sum_tiyin"] = pd.Series(amounts, dtype=object)


def load_dataset(data_dir: Path, profile: str = "generic") -> Dataset:
    data_dir = Path(data_dir)
    if profile not in {"generic", "official"}:
        raise DataValidationError("profile must be generic or official")
    tables, hashes, audit = {}, {}, {"extra_columns": {}}
    for name, columns in COLUMNS.items():
        path = data_dir / f"{name}.parquet"
        if not path.is_file():
            raise DataValidationError(f"Missing input file: {path}")
        # Hash exactly the bytes read below, detecting modification during load.
        before = sha256(path.read_bytes()).hexdigest()
        try:
            frame = pd.read_parquet(path)
        except Exception as exc:
            raise DataValidationError(
                f"{path.name}: invalid parquet ({type(exc).__name__})"
            ) from exc
        if sha256(path.read_bytes()).hexdigest() != before:
            raise DataValidationError(f"{path.name}: source changed during reading")
        hashes[path.name] = before
        missing = sorted(set(columns) - set(frame.columns))
        if missing:
            raise DataValidationError(f"{name}: missing columns {missing}")
        if frame[columns].isna().any().any():
            raise DataValidationError(f"{name}: null in required columns")
        audit["extra_columns"][name] = sorted(set(frame.columns) - set(columns))
        tables[name] = frame[columns].copy().reset_index(drop=True)
    nodes, edges, tx = (tables[k] for k in COLUMNS)
    if nodes.empty:
        raise DataValidationError("nodes: at least one node required")
    _integer(nodes, "gid", "nodes", minimum=1)
    _integer(nodes, "depth", "nodes", maximum=4)
    if not nodes.gid.is_unique:
        raise DataValidationError("nodes.gid: must be unique")
    if not is_bool_dtype(nodes.is_seed.dtype) or not (nodes.is_seed == (nodes.depth == 0)).all():
        raise DataValidationError("nodes.is_seed: boolean seed must correspond to depth=0")
    known = set(nodes.gid)
    for name, frame in [("edges", edges), ("transactions", tx)]:
        for col in ("src", "dst"):
            _integer(frame, col, name, minimum=1)
            if not frame[col].isin(known).all():
                raise DataValidationError(f"{name}.{col}: unknown endpoint")
        if (frame.src == frame.dst).any():
            raise DataValidationError(f"{name}: self-loop unsupported by rules v1")
        _money(frame, name)
    _integer(edges, "n_tx", "edges", minimum=1)
    _integer(edges, "depth", "edges", minimum=1, maximum=4)
    if edges.duplicated(["src", "dst"]).any():
        raise DataValidationError("edges: src,dst pairs must be unique")
    try:
        dates = pd.to_datetime(tx.date, format="%Y-%m-%d", errors="raise")
        if getattr(dates.dt, "tz", None) is not None or not (dates == dates.dt.normalize()).all():
            raise ValueError("expected day precision")
    except (ValueError, TypeError, AttributeError) as exc:
        raise DataValidationError("transactions.date: invalid day-precision date") from exc
    if not dates.between("2026-07-01", "2026-07-31").all():
        raise DataValidationError("transactions.date: outside supported July 2026 period")
    if (tx.sum_tiyin < 500_000).any():
        raise DataValidationError("transactions.sum_kzt: below 5000 KZT threshold")
    tx["date"] = dates.dt.strftime("%Y-%m-%d")
    audit["duplicate_transactions"] = int(tx.duplicated(COLUMNS["transactions"]).sum())
    tx["source_row"] = range(len(tx))
    tx["source_ref"] = [f"tx:{hashes['transactions.parquet'][:12]}:{i}" for i in range(len(tx))]
    aggregates = {}
    for src, dst, amount in tx[["src", "dst", "sum_tiyin"]].itertuples(index=False, name=None):
        key = (int(src), int(dst))
        total, count = aggregates.get(key, (0, 0))
        aggregates[key] = (total + int(amount), count + 1)
    if set(aggregates) != set(edges[["src", "dst"]].itertuples(index=False, name=None)):
        raise DataValidationError("edges/transactions: aggregate pairs differ")
    canonical, tolerance_pairs = [], 0
    for src, dst, amount, count in edges[["src", "dst", "sum_tiyin", "n_tx"]].itertuples(
        index=False, name=None
    ):
        total, actual_count = aggregates[(src, dst)]
        if int(count) != actual_count:
            raise DataValidationError(f"edges: transaction count mismatch for {src}->{dst}")
        delta = abs(total - int(amount))
        if delta > 1:
            raise DataValidationError(
                f"edges: aggregate sum mismatch for {src}->{dst}: {delta} tiyin"
            )
        tolerance_pairs += int(delta != 0)
        canonical.append(total)
    edges["sum_tiyin"] = pd.Series(canonical, dtype=object)
    audit.update(
        rows={k: len(v) for k, v in tables.items()},
        source_hashes=hashes,
        source_bytes={k: (data_dir / k).stat().st_size for k in hashes},
        aggregate_tolerance_pairs=tolerance_pairs,
        total_tiyin=sum(int(x) for x in tx.sum_tiyin),
        seeds=int(nodes.is_seed.sum()),
        profile=profile,
    )
    if profile == "official":
        manifest = json.loads(
            (
                Path(__file__).resolve().parents[1] / "docs/hackalem/sources/manifest.json"
            ).read_text()
        )
        expected = {
            Path(x["path"]).name: x["sha256"]
            for x in manifest["files"]
            if x["path"].endswith(".parquet")
        }
        if hashes != expected:
            raise DataValidationError(
                "official profile: source hashes do not match organizer files"
            )
        if tuple(len(tables[k]) for k in COLUMNS) != (2248, 3119, 4840):
            raise DataValidationError("official profile: wrong row counts")
    return Dataset(
        nodes.sort_values("gid").reset_index(drop=True),
        edges.sort_values(["src", "dst"]).reset_index(drop=True),
        tx,
        hashes,
        audit,
    )
