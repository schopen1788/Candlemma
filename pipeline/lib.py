"""특징 계산·패턴 탐지·라벨링 순수 함수. 각 단계 스크립트와 테스트가 공유한다."""
import numpy as np
import pandas as pd

LOOKBACK = 120


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """일봉(date,o,h,l,c,v) → 특징 열 추가. TV는 억 원 단위 추정 거래대금(종가×거래량)."""
    df = df.sort_values("date").reset_index(drop=True).copy()
    c, h, l, o = df["c"], df["h"], df["l"], df["o"]
    df["tv"] = c * df["v"] / 1e8
    df["tv20"] = df["tv"].shift(1).rolling(20).mean()          # D-20 ~ D-1 평균
    df["tv_ratio"] = df["tv"] / df["tv20"]
    df["tvma20"] = df["tv"].rolling(20).mean()                 # 차트 표시용 (당일 포함)
    df["tv_m20"] = df["tv"].rolling(20).mean()
    df["tv_m60"] = df["tv"].rolling(60).mean()
    for n in (5, 20, 60):
        df[f"ma{n}"] = c.rolling(n).mean()
    df["c1"] = c.shift(1)
    df["chg"] = (c / df["c1"] - 1) * 100
    df["hh120"] = h.shift(1).rolling(120).max()
    df["hh20"] = h.rolling(20).max()
    df["ll20"] = l.rolling(20).min()
    df["new20"] = (h >= df["hh20"]).astype(float)
    tr = pd.concat([h - l, (h - df["c1"]).abs(), (l - df["c1"]).abs()], axis=1).max(axis=1)
    df["atr20_pct"] = tr.rolling(20).mean() / c * 100
    return df


def box(df: pd.DataFrame, days: int):
    hi = df["h"].shift(1).rolling(days).max()
    lo = df["l"].shift(1).rolling(days).min()
    return hi, lo, (hi / lo - 1) * 100


def detect(df: pd.DataFrame, pcfg: dict) -> pd.DataFrame:
    """패턴별 불리언 열을 가진 DataFrame 반환 (add_features 결과 입력)."""
    P = pcfg["patterns"]
    out = pd.DataFrame(index=df.index)
    c, o, l = df["c"], df["o"], df["l"]

    p = P["new_high"]
    hh = df["h"].shift(1).rolling(p["lookback"]).max()
    out["new_high"] = (c > hh) & (df["tv_ratio"] >= p["tv_mult"])

    p = P["box_breakout"]
    hi, lo, rng = box(df, p["box_days"])
    out["box_breakout"] = (rng <= p["max_range_pct"]) & (c > hi)

    p = P["gap_up"]
    out["gap_up"] = o >= df["c1"] * (1 + p["gap_pct"] / 100)

    p = P["ma20_pullback"]
    new_hi = (df["h"] >= df["h"].rolling(p["high_window"]).max()).astype(float)
    recent = new_hi.shift(1).rolling(p["recent_high_days"]).max() == 1
    near = (l / df["ma20"] - 1).abs() * 100 <= p["ma_band_pct"]
    out["ma20_pullback"] = recent & near & (df["tv_ratio"] < p["tv_mult_max"])

    p = P["dry_sideways"]
    rng20 = (df["h"].rolling(p["range_days"]).max() / df["l"].rolling(p["range_days"]).min() - 1) * 100
    out["dry_sideways"] = (df["tv_m20"] < p["tv_ratio_max"] * df["tv_m60"]) & (rng20 <= p["max_range_pct"])

    return out.fillna(False).astype(bool)


def pattern_order(pcfg: dict) -> list[str]:
    return sorted(pcfg["patterns"], key=lambda k: pcfg["patterns"][k]["num"])


def valid_mask(df: pd.DataFrame, future_required: int, min_tv: float, start: str, end: str) -> pd.Series:
    """출제 필터: 과거 120일 + MA60 워밍업, 이후 30일 존재, 거래정지(거래량 0) 없음, 거래대금 하한, 기간."""
    n = len(df)
    idx = np.arange(n)
    ok = (idx >= LOOKBACK - 1 + 60) & (idx + future_required < n)
    halt = (df["v"] <= 0) | (df[["o", "h", "l", "c"]] <= 0).any(axis=1)
    window = LOOKBACK + future_required
    # [i-119, i+30] 구간에 정지일이 있으면 제외
    halt_cnt = halt.astype(int).rolling(window).sum().shift(-future_required)
    ok &= (halt_cnt.fillna(1) == 0).to_numpy()
    ok &= (df["tv"] >= min_tv).to_numpy()
    d = df["date"]
    ok &= ((d >= pd.Timestamp(start)) & (d <= pd.Timestamp(end))).to_numpy()
    return pd.Series(ok, index=df.index)


def judge(change_pct: float, band: float) -> str:
    """변동률(%)과 보합 범위로 정답 방향. 경계값(=band)은 보합."""
    if change_pct > band:
        return "up"
    if change_pct < -band:
        return "down"
    return "flat"


def observed_tags(row: pd.Series) -> list[str]:
    """D0 시점에 차트에서 관찰되는 근거 태그 (key_tags 보정용)."""
    t = []
    if row["tv_ratio"] >= 2:
        t.append("거래대금 급증")
    if row["tv_ratio"] < 0.7:
        t.append("거래대금 감소")
    if row["c"] > row["hh120"]:
        t.append("신고가 돌파")
    if row.get("box_hi") and row.get("box_rng", 99) <= 15:
        if row["c"] > row["box_hi"]:
            t.append("박스권 돌파")
        elif row["c"] < row["box_lo"]:
            t.append("박스권 이탈")
    if abs(row["l"] / row["ma20"] - 1) <= 0.02 and row["c"] >= row["ma20"]:
        t.append("이평선 지지")
    if row["c1"] > row["ma20"] and row["c"] < row["ma20"] * 0.97:
        t.append("이평선 이탈")
    body = abs(row["c"] - row["o"])
    up_w = row["h"] - max(row["o"], row["c"])
    lo_w = min(row["o"], row["c"]) - row["l"]
    if up_w > 0 and up_w >= 2 * body:
        t.append("긴 윗꼬리")
    if lo_w > 0 and lo_w >= 2 * body:
        t.append("긴 아랫꼬리")
    return t


def key_tags(pattern_defaults: list[str], observed: list[str], tv_ratio: float) -> list[str]:
    """패턴 기본 태그 중 실제 관찰된 것 우선, 없으면 첫 기본 태그. 최대 2개."""
    keys = [t for t in pattern_defaults if t in observed] or pattern_defaults[:1]
    if len(keys) < 2 and tv_ratio >= 3 and "거래대금 급증" not in keys:
        keys.append("거래대금 급증")
    return keys[:2]


def balance_quota(avail: dict[str, int], target: int, lo: float = 0.25, hi: float = 0.40) -> dict[str, int]:
    """상승/보합/하락 각 비율이 lo~hi 사이가 되도록 클래스별 뽑을 개수 계산."""
    classes = ["up", "flat", "down"]
    q = {k: min(avail.get(k, 0), target // 3 + (1 if i < target % 3 else 0)) for i, k in enumerate(classes)}
    # 부족한 클래스가 있으면 다른 클래스를 상한까지만 늘린다
    while True:
        total = sum(q.values())
        if total == 0:
            return q
        over = [k for k in classes if q[k] / total > hi]
        if not over:
            break
        k = max(over, key=lambda x: q[x])
        q[k] -= 1
    total = sum(q.values())
    if total and min(q.values()) / total < lo:
        # 최소 비율도 못 맞추면 큰 클래스를 줄인다
        while total and min(q.values()) / total < lo:
            k = max(classes, key=lambda x: q[x])
            q[k] -= 1
            total = sum(q.values())
    return q


def normalize_bars(df: pd.DataFrame, start: int, end: int, c0: float, d0: int) -> list[dict]:
    """[start, end] 구간 봉을 D0 종가 대비 % 로 정규화. d = i - d0."""
    rows = []
    for i in range(start, end + 1):
        r = df.iloc[i]
        rows.append({
            "d": int(i - d0),
            "o": round((r["o"] / c0 - 1) * 100, 2),
            "h": round((r["h"] / c0 - 1) * 100, 2),
            "l": round((r["l"] / c0 - 1) * 100, 2),
            "c": round((r["c"] / c0 - 1) * 100, 2),
            "tv": round(float(r["tv"]), 1),
        })
    return rows


def normalize_series(s: pd.Series, start: int, end: int, c0: float) -> list:
    vals = s.iloc[start:end + 1]
    return [None if pd.isna(v) else round((v / c0 - 1) * 100, 2) for v in vals]
