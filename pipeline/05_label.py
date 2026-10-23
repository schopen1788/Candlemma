"""05. T+1/T+3/T+5 결과 라벨링, key_tags 계산 → data/labeled.parquet"""
import pandas as pd
import argparse

from common import DATA, judge_cfg, patterns_cfg
from lib import judge, key_tags, observed_tags

FEAT = DATA / "features"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-existing', action='store_true', help='Rejudge saved percentage changes without fetching or rescanning candles')
    args = ap.parse_args()
    jcfg, pcfg = judge_cfg(), patterns_cfg()
    if args.from_existing:
        lab = pd.read_parquet(DATA / 'labeled.parquet')
        for h, band in jcfg['horizons'].items():
            lab[f'ans_{h}'] = lab[f'chg_{h}'].map(lambda chg: judge(chg, band))
        lab.to_parquet(DATA / 'labeled.parquet', index=False)
        print(f'rejudged: {len(lab)} scenes using {jcfg["version"]}')
        return
    sc = pd.read_parquet(DATA / "scenes.parquet")
    out = []
    for code, g in sc.groupby("code"):
        f = pd.read_parquet(FEAT / f"{code}.parquet")
        closes = f["c"].to_numpy()
        for _, r in g.iterrows():
            i, c0 = int(r["idx"]), r["c"]
            rec = r.to_dict()
            for h, band in jcfg["horizons"].items():
                chg = round((closes[i + h] / c0 - 1) * 100, 2)
                rec[f"chg_{h}"] = chg
                rec[f"ans_{h}"] = judge(chg, band)
            obs = observed_tags(r)
            rec["observed_tags"] = obs
            rec["key_tags"] = key_tags(pcfg["patterns"][r["pattern"]]["key_tags"], obs, r["tv_ratio"])
            out.append(rec)
    lab = pd.DataFrame(out)
    lab.to_parquet(DATA / "labeled.parquet", index=False)
    print(f"labeled: {len(lab)}")
    for h in jcfg["horizons"]:
        print(f"T+{h}", lab[f"ans_{h}"].value_counts(normalize=True).round(3).to_dict())


if __name__ == "__main__":
    main()
