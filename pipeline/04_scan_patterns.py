"""04. 패턴 규칙으로 후보 장면 탐지 → data/scenes.parquet

한 장면이 여러 패턴에 해당하면 번호가 가장 작은 패턴이 주 패턴, 나머지는 sub_patterns.
"""
import pandas as pd

from common import DATA, judge_cfg, patterns_cfg
from lib import detect, pattern_order, valid_mask

FEAT = DATA / "features"
KEEP = ["date", "tv_m20", "tv_m60", "hh20", "ll20", "o", "h", "l", "c", "c1", "tv", "tv20", "tv_ratio", "ma20", "hh120", "box_hi", "box_lo", "box_rng", "chg", "atr20_pct"]


def main():
    pcfg, jcfg = patterns_cfg(), judge_cfg()
    sf = pcfg["scene_filter"]
    order = pattern_order(pcfg)
    rows = []
    for p in sorted(FEAT.glob("*.parquet")):
        df = pd.read_parquet(p)
        hits = detect(df, pcfg)
        ok = valid_mask(df, jcfg["future_required"], sf["min_tv_eok"], sf["start"], sf["end"])
        any_hit = hits.any(axis=1) & ok
        for i in df.index[any_hit]:
            pats = [k for k in order if hits.at[i, k]]
            r = {k: df.at[i, k] for k in KEEP}
            r.update(code=p.stem, idx=int(i), pattern=pats[0], sub_patterns=pats[1:])
            rows.append(r)
    sc = pd.DataFrame(rows)
    sc.to_parquet(DATA / "scenes.parquet", index=False)
    print(f"scenes: {len(sc)}")
    print(sc["pattern"].value_counts().to_string())


if __name__ == "__main__":
    main()
