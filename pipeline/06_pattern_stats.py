"""06. 패턴별·기간별 결과 분포 (균형 샘플링 전 원본) → data/pattern_stats.json"""
import json

import pandas as pd

from common import DATA, judge_cfg


def compute(lab: pd.DataFrame, horizons) -> list[dict]:
    stats = []
    for pat, g in lab.groupby("pattern"):
        for h in horizons:
            vc = g[f"ans_{h}"].value_counts(normalize=True)
            stats.append({
                "pattern": pat, "horizon": int(h), "n": int(len(g)),
                "up": round(float(vc.get("up", 0)) * 100, 1),
                "flat": round(float(vc.get("flat", 0)) * 100, 1),
                "down": round(float(vc.get("down", 0)) * 100, 1),
            })
    return stats


def main():
    lab = pd.read_parquet(DATA / "labeled.parquet")
    stats = compute(lab, judge_cfg()["horizons"])
    (DATA / "pattern_stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    for s in stats:
        print(s)


if __name__ == "__main__":
    main()
