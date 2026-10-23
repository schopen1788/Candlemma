"""패턴 규칙 단위 테스트: 가짜 일봉으로 탐지 여부 확인."""
import numpy as np
import pandas as pd
import pytest

from common import patterns_cfg
from lib import add_features, detect, judge

PCFG = patterns_cfg()
N = 300


def flat_series(price=10000.0, vol=100_000, wiggle=0.01, seed=0):
    """price 주변 ±wiggle 로 움직이는 횡보 일봉."""
    rng = np.random.default_rng(seed)
    c = price * (1 + rng.uniform(-wiggle, wiggle, N))
    o = np.r_[price, c[:-1]]
    h = np.maximum(o, c) * 1.003
    l = np.minimum(o, c) * 0.997
    return pd.DataFrame({
        "date": pd.bdate_range("2020-01-01", periods=N),
        "o": o, "h": h, "l": l, "c": c, "v": np.full(N, vol, dtype=float),
    })


def set_last(df, o, h, l, c, v):
    df.loc[N - 1, ["o", "h", "l", "c", "v"]] = [o, h, l, c, v]
    return df


def hits(df):
    return detect(add_features(df), PCFG).iloc[-1]


def test_new_high_with_volume():
    df = set_last(flat_series(), 10100, 10800, 10050, 10700, 300_000)
    r = hits(df)
    assert r["new_high"]
    assert r["box_breakout"]  # 횡보 상단 돌파이기도 함 → 04 에서 번호 작은 new_high 가 주 패턴


def test_new_high_without_volume_is_not_pattern1():
    df = set_last(flat_series(), 10100, 10800, 10050, 10700, 120_000)
    assert not hits(df)["new_high"]


def test_box_breakout_requires_narrow_box():
    df = flat_series(wiggle=0.12)  # 고저폭이 15%를 넘는 박스
    df = set_last(df, 11000, 11400, 10900, 11300, 100_000)
    assert not hits(df)["box_breakout"]


def test_gap_up():
    df = flat_series()
    prev = df.loc[N - 2, "c"]
    df = set_last(df, prev * 1.06, prev * 1.08, prev * 1.05, prev * 1.07, 100_000)
    assert hits(df)["gap_up"]
    df2 = set_last(flat_series(), prev * 1.03, prev * 1.04, prev * 1.02, prev * 1.03, 100_000)
    assert not hits(df2)["gap_up"]


def test_ma20_pullback():
    df = flat_series()
    # D-20 ~ D-6 상승, D-5 고점, 이후 20일선 부근으로 눌림 + 거래대금 감소
    for k, i in enumerate(range(N - 20, N - 5)):
        p = 10000 * (1 + 0.01 * (k + 1))
        df.loc[i, ["o", "h", "l", "c"]] = [p * 0.995, p * 1.003, p * 0.99, p]
    ma20 = df["c"].iloc[N - 20:N].mean()
    for i in range(N - 5, N):
        df.loc[i, ["o", "h", "l", "c", "v"]] = [ma20 * 1.03, ma20 * 1.035, ma20 * 1.01, ma20 * 1.02, 100_000]
    df.loc[N - 1, ["o", "h", "l", "c", "v"]] = [ma20 * 1.02, ma20 * 1.025, ma20 * 1.0, ma20 * 1.015, 40_000]
    assert hits(df)["ma20_pullback"]


def test_dry_sideways():
    df = flat_series(wiggle=0.01)
    df.loc[: N - 21, "v"] = 300_000   # 과거엔 활발
    df.loc[N - 20:, "v"] = 50_000     # 최근 20일 고갈
    assert hits(df)["dry_sideways"]
    df.loc[N - 20:, "v"] = 300_000
    assert not hits(df)["dry_sideways"]


@pytest.mark.parametrize("chg,band,expect", [
    (1.5, 1.0, "up"), (1.0, 1.0, "flat"), (-1.0, 1.0, "flat"), (-1.01, 1.0, "down"), (0, 3.0, "flat"),
])
def test_judge(chg, band, expect):
    assert judge(chg, band) == expect
