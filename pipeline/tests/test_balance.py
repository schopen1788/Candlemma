import itertools

import pandas as pd
import pytest

from lib import balance_quota

sample = __import__("07_sample_balance")


@pytest.mark.parametrize("avail", [
    {"up": 1000, "flat": 1000, "down": 1000},
    {"up": 1000, "flat": 30, "down": 900},
    {"up": 50, "flat": 2000, "down": 60},
])
def test_quota_ratio(avail):
    q = balance_quota(avail, 100)
    total = sum(q.values())
    assert total > 0
    for v in q.values():
        assert 0.25 <= v / total <= 0.40
        assert v <= max(avail.values())


def test_sample_gap_and_balance():
    rows = []
    for code, i, a in itertools.product(["A", "B", "C", "D"], range(0, 2000, 7), ["up", "flat", "down"]):
        rows.append({"code": code, "idx": i + {"up": 0, "flat": 2, "down": 4}[a], "pattern": "p",
                     "ans_1": a, "ans_5": a})
    lab = pd.DataFrame(rows)
    out = sample.sample(lab, {1: 30, 5: 30}, min_gap=20)
    assert len(out) == 60
    for code, g in out.groupby("code"):
        idx = sorted(g["idx"])
        assert all(b - a >= 20 for a, b in zip(idx, idx[1:]))
    for h, g in out.groupby("horizon"):
        dist = g[f"ans_{h}"].value_counts(normalize=True)
        assert dist.between(0.25, 0.40).all()
