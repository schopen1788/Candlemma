"""09. 해설 문장 생성 (템플릿 + 수치) → sampled.parquet 에 explain 열 추가"""
import pandas as pd

from common import DATA, judge_cfg, load_yaml


def values(r) -> dict:
    return {
        "brk": (r["c"] / r["hh120"] - 1) * 100,
        "tvx": r["tv_ratio"],
        "box_rng": r["box_rng"],
        "box_brk": (r["c"] / r["box_hi"] - 1) * 100,
        "gap": (r["o"] / r["c1"] - 1) * 100,
        "day_chg": r["chg"],
        "ma_dist": (r["l"] / r["ma20"] - 1) * 100,
        "dry": r["tv_m20"] / r["tv_m60"],
        "rng20": (r["hh20"] / r["ll20"] - 1) * 100,
    }


def explain(r, tpl: dict, band: float) -> str:
    h = int(r["horizon"])
    t = tpl["patterns"][r["pattern"]]
    v = values(r)
    ans = r[f"ans_{h}"]
    return " ".join([
        t["obs"].format(**v),
        t[ans],
        tpl["outcome"].format(h=h, chg=r[f"chg_{h}"], band=band),
    ])


def main():
    tpl = load_yaml("explain.yaml")
    bands = judge_cfg()["horizons"]
    sp = pd.read_parquet(DATA / "sampled.parquet")
    sp["explain"] = [explain(r, tpl, bands[int(r["horizon"])]) for _, r in sp.iterrows()]
    sp.to_parquet(DATA / "sampled.parquet", index=False)
    for s in sp.groupby("pattern").head(1)["explain"]:
        print("-", s)


if __name__ == "__main__":
    main()
