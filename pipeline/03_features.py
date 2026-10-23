"""03. 일봉 → 특징 (이평선, 거래대금 배수, ATR, 고점/저점, 박스 범위) → data/features/{code}.parquet"""
import pandas as pd

from common import DAILY, DATA
from lib import add_features, box

FEAT = DATA / "features"
FEAT.mkdir(exist_ok=True)


def main():
    files = sorted(DAILY.glob("*.parquet"))
    for p in files:
        df = pd.read_parquet(p)
        if len(df) < 200:
            continue
        f = add_features(df)
        f["box_hi"], f["box_lo"], f["box_rng"] = box(f, 40)
        f.to_parquet(FEAT / p.name, index=False)
    print(f"features: {len(files)} files")


if __name__ == "__main__":
    main()
