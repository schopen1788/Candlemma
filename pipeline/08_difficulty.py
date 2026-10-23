"""08. 초기 난이도 레이팅 (PLAN.md 4.5) → sampled.parquet 에 difficulty_init 열 추가"""
import json

import pandas as pd

from common import DATA, judge_cfg


def difficulty(answer: str, majority: str, change: float, band: float, tv_ratio: float) -> int:
    r = 1500
    if answer != majority:
        r += 200
    if abs(abs(change) - band) <= 0.5:
        r += 150
    if tv_ratio >= 5:
        r -= 150
    return max(1000, min(2200, r))


def main():
    bands = judge_cfg()["horizons"]
    stats = json.loads((DATA / "pattern_stats.json").read_text(encoding="utf-8"))
    major = {(s["pattern"], s["horizon"]): max(("up", "flat", "down"), key=lambda k: s[k]) for s in stats}
    sp = pd.read_parquet(DATA / "sampled.parquet")
    sp["difficulty_init"] = [
        difficulty(r[f"ans_{r['horizon']}"], major[(r["pattern"], r["horizon"])], r[f"chg_{r['horizon']}"], bands[r["horizon"]], r["tv_ratio"])
        for _, r in sp.iterrows()
    ]
    sp.to_parquet(DATA / "sampled.parquet", index=False)
    print(sp["difficulty_init"].describe().to_string())


if __name__ == "__main__":
    main()
