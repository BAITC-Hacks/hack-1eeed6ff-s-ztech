from pathlib import Path

import pandas as pd
import pytest

from app.loader import DataValidationError, load_dataset
from app.features import build_graph
from conftest import A, B, C, mutate


def test_duplicate_payments_exact_ids_and_isolated_seed_survive(raw_dir):
    ds = load_dataset(raw_dir)
    graph = build_graph(ds)
    assert set(graph) == {A, B, C}
    assert graph.degree(C) == 0
    assert graph[A][B]['sum_tiyin'] == 1_000_002
    assert graph[A][B]['n_tx'] == 2
    assert ds.transactions['sum_tiyin'].tolist() == [500_001, 500_001]
    assert ds.transactions['source_row'].tolist() == [0, 1]
    assert ds.audit['duplicate_transactions'] == 1


@pytest.mark.parametrize('name,col,value,match', [
    ('edges', 'dst', C + 1, 'endpoint'),
    ('transactions', 'dst', C + 1, 'endpoint'),
    ('transactions', 'sum_kzt', -5000.01, 'positive'),
    ('transactions', 'sum_kzt', float('inf'), 'finite'),
    ('transactions', 'sum_kzt', float('nan'), 'null'),
    ('transactions', 'sum_kzt', 5000.001, 'precision'),
    ('transactions', 'sum_kzt', 4999., 'threshold'),
    ('transactions', 'date', '2026-08-01', 'period'),
    ('transactions', 'date', 'not-a-date', 'date'),
    ('edges', 'n_tx', 3, 'count'),
    ('edges', 'sum_kzt', 10000.04, 'aggregate'),
    ('nodes', 'depth', 5, 'depth'),
    ('nodes', 'is_seed', False, 'seed'),
])
def test_invalid_input_stops_before_analysis(raw_dir, name, col, value, match):
    mutate(raw_dir, name, lambda d: d.__setitem__(col, [value] + d[col].tolist()[1:]))
    with pytest.raises(DataValidationError, match=match):
        load_dataset(raw_dir)


def test_self_loop_rejected(raw_dir):
    mutate(raw_dir, 'edges', lambda d: d.__setitem__('dst', [A]))
    with pytest.raises(DataValidationError, match='self-loop'):
        load_dataset(raw_dir)


def test_float_gid_rejected_even_when_it_looks_integral(raw_dir):
    mutate(raw_dir, 'nodes', lambda d: d.astype({'gid': 'float64'}))
    with pytest.raises(DataValidationError, match='integer'):
        load_dataset(raw_dir)


def test_duplicate_nodes_rejected(raw_dir):
    mutate(raw_dir, 'nodes', lambda d: pd.concat([d, d.iloc[[0]]], ignore_index=True))
    with pytest.raises(DataValidationError, match='unique'):
        load_dataset(raw_dir)


def test_duplicate_edge_pairs_rejected(raw_dir):
    mutate(raw_dir, 'edges', lambda d: pd.concat([d, d], ignore_index=True))
    with pytest.raises(DataValidationError, match='unique'):
        load_dataset(raw_dir)


def test_one_tiyin_aggregate_discrepancy_uses_transactions_and_reports_it(raw_dir):
    mutate(raw_dir, 'edges', lambda d: d.__setitem__('sum_kzt', [10000.03]))
    ds = load_dataset(raw_dir)
    assert ds.edges['sum_tiyin'].tolist() == [1_000_002]
    assert ds.audit['aggregate_tolerance_pairs'] == 1


def test_missing_file_is_actionable(tmp_path):
    with pytest.raises(DataValidationError, match='nodes.parquet'):
        load_dataset(tmp_path)


def test_official_data_independent_regression():
    ds = load_dataset(Path(__file__).resolve().parents[1] / 'data', profile='official')
    g = build_graph(ds)
    assert (len(ds.nodes), len(ds.edges), len(ds.transactions)) == (2248, 3119, 4840)
    assert sum(int(x) for x in ds.transactions.sum_tiyin) == 36_589_001_201
    assert sum(int(x) for x in ds.edges.sum_tiyin) == 36_589_001_201
    assert sum(g.degree(v) == 0 for v in g) == 19
    assert ds.audit['duplicate_transactions'] == 97
    assert sum(g.out_degree(v) == 0 and g.nodes[v]['depth'] == 4 for v in g) == 444
