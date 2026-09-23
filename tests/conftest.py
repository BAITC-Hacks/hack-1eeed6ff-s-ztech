from pathlib import Path

import pandas as pd
import pytest

A = 100000000011452100
B = 100000000011452101
C = 100000000011452102


@pytest.fixture
def raw_dir(tmp_path: Path) -> Path:
    pd.DataFrame({'gid': [A, B, C], 'depth': [0, 1, 0], 'is_seed': [True, False, True]}).to_parquet(tmp_path / 'nodes.parquet')
    pd.DataFrame({'src': [A], 'dst': [B], 'sum_kzt': [10000.02], 'n_tx': [2], 'depth': [1]}).to_parquet(tmp_path / 'edges.parquet')
    pd.DataFrame({'src': [A, A], 'dst': [B, B], 'date': ['2026-07-01'] * 2, 'sum_kzt': [5000.01, 5000.01]}).to_parquet(tmp_path / 'transactions.parquet')
    return tmp_path


def mutate(data_dir, name, fn):
    p = data_dir / f'{name}.parquet'
    frame = pd.read_parquet(p)
    result = fn(frame)
    (frame if result is None else result).to_parquet(p, index=False)
