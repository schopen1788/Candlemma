"""07. 패턴별 상승/보합/하락 균형 샘플링 → data/sampled.parquet

- 패턴·판정 기간마다 정답 비율이 25~40% 안에 들도록 뽑는다.
- 같은 종목 장면 간 간격은 최소 min_gap_days 거래일.
"""
import numpy as np
import pandas as pd

from common import DATA, patterns_cfg
from lib import balance_quota

SEED = 20261023


def sample(lab: pd.DataFrame, targets: dict[int, int], min_gap: int, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    lab = lab.iloc[rng.permutation(len(lab))].reset_index(drop=True)
    used_idx: dict[str, list[int]] = {}
    picked = []

    def gap_ok(code, idx):
        return all(abs(idx - j) >= min_gap for j in used_idx.get(code, []))

    for pat, g in lab.groupby("pattern", sort=True):
        taken = set()
        for h, target in targets.items():
            avail = {k: int((g[f"ans_{h}"] == k).sum()) for k in ("up", "flat", "down")}
            quota = balance_quota(avail, target)
            for cls, q in quota.items():
                n = 0
                for ri, r in g[g[f"ans_{h}"] == cls].iterrows():
                    if n >= q:
                        break
                    if ri in taken or not gap_ok(r["code"], r["idx"]):
                        continue
                    taken.add(ri)
                    used_idx.setdefault(r["code"], []).append(int(r["idx"]))
                    rec = r.to_dict()
                    rec["horizon"] = int(h)
                    picked.append(rec)
                    n += 1
    return pd.DataFrame(picked)


def main():
    pcfg = patterns_cfg()
    s = pcfg["sampling"]
    lab = pd.read_parquet(DATA / "labeled.parquet")
    out = sample(lab, {int(k): int(v) for k, v in s["per_horizon"].items()}, pcfg["scene_filter"]["min_gap_days"])
    out.to_parquet(DATA / "sampled.parquet", index=False)
    print(f"sampled: {len(out)}")
    for (pat, h), g in out.groupby(["pattern", "horizon"]):
        dist = g.apply(lambda r: r[f"ans_{h}"], axis=1).value_counts(normalize=True).round(2).to_dict()
        print(pat, f"T+{h}", len(g), dist)


if __name__ == "__main__":
    main()
