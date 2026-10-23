"""01. 종목 목록 (상장 + 상장폐지) → data/raw/universe.parquet

- 코스피·코스닥 보통주만 (ETF·ETN·스팩·우선주·코넥스 제외)
- 생존 편향 방지를 위해 출제 기간 중 상장폐지된 종목도 포함
"""
import pandas as pd
import FinanceDataReader as fdr

from common import RAW, load_yaml, patterns_cfg


def map_sector(industry, rules, default):
    if not isinstance(industry, str):
        return default
    for name, keys in rules:
        if any(k in industry for k in keys):
            return name
    return default


def is_common_stock(code: str, name: str) -> bool:
    return code.isdigit() and code.endswith("0") and "스팩" not in name and "리츠" not in name


def main():
    sec = load_yaml("sectors.yaml")
    rules, default = sec["sectors"], sec["default"]
    start = patterns_cfg()["scene_filter"]["start"]

    live = fdr.StockListing("KRX-DESC")
    live["Market"] = live["Market"].replace({"KOSDAQ GLOBAL": "KOSDAQ"})
    live = live[live["Market"].isin(["KOSPI", "KOSDAQ"])]
    live = pd.DataFrame({
        "code": live["Code"], "name": live["Name"], "market": live["Market"],
        "industry": live["Industry"], "delisted": False, "delisting_date": None,
    })

    dl = fdr.StockListing("KRX-DELISTING")
    dl["DelistingDate"] = pd.to_datetime(dl["DelistingDate"], errors="coerce")
    dl = dl[(dl["SecuGroup"] == "주권") & (dl["Kind"] == "보통주")
            & dl["Market"].isin(["KOSPI", "KOSDAQ"])
            & (dl["DelistingDate"] >= pd.Timestamp(start))]
    dl = pd.DataFrame({
        "code": dl["Symbol"], "name": dl["Name"], "market": dl["Market"],
        "industry": dl["Industry"], "delisted": True,
        "delisting_date": dl["DelistingDate"].dt.strftime("%Y-%m-%d"),
    })

    uni = pd.concat([live, dl], ignore_index=True)
    uni = uni[[is_common_stock(str(c), str(n)) for c, n in zip(uni["code"], uni["name"])]]
    uni = uni.drop_duplicates("code", keep="first")
    uni["sector"] = [map_sector(i, rules, default) for i in uni["industry"]]
    uni = uni.reset_index(drop=True)
    uni.to_parquet(RAW / "universe.parquet", index=False)
    print(f"universe: {len(uni)} (상장 {(~uni.delisted).sum()}, 상폐 {uni.delisted.sum()})")
    print(uni["sector"].value_counts().to_string())


if __name__ == "__main__":
    main()
