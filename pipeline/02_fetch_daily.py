"""02. 종목별 일봉 → data/raw/daily/{code}.parquet (증분 수집)

- FinanceDataReader(네이버 수정주가) 사용. KRX 정보데이터시스템은 로그인이 필요해져 pykrx 원본 조회가 막혀 있다.
- 거래대금은 원천에 없으므로 종가 × 거래량으로 추정한다 (수정주가 × 수정거래량 ≈ 실제 거래대금).
- 이미 받은 날짜는 건너뛴다. 요청 사이 0.5초 대기.
"""
import argparse
import time
from datetime import date, timedelta

import pandas as pd
import FinanceDataReader as fdr

from common import DAILY, RAW

FETCH_START = "2019-01-01"


def fetch_one(code: str, end: str) -> int:
    path = DAILY / f"{code}.parquet"
    old = pd.read_parquet(path) if path.exists() else None
    start = FETCH_START
    if old is not None and len(old):
        last = pd.Timestamp(old["date"].max())
        if last >= pd.Timestamp(end) - pd.Timedelta(days=3):
            return 0
        start = (last + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    df = fdr.DataReader(code, start, end)
    if df is None or df.empty:
        return 0
    df = df.reset_index().rename(columns={"Date": "date", "Open": "o", "High": "h", "Low": "l", "Close": "c", "Volume": "v"})
    df = df[["date", "o", "h", "l", "c", "v"]]
    df["date"] = pd.to_datetime(df["date"])
    if old is not None:
        df = pd.concat([old, df]).drop_duplicates("date", keep="last").sort_values("date")
    df.to_parquet(path, index=False)
    return len(df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--delay", type=float, default=0.5)
    args = ap.parse_args()

    uni = pd.read_parquet(RAW / "universe.parquet")
    end = (date.today() - timedelta(days=1)).isoformat()
    codes = uni["code"].tolist()[: args.limit or None]
    fail = []
    for i, code in enumerate(codes, 1):
        try:
            fetch_one(code, end)
        except Exception as e:  # 네트워크 오류는 다음 실행에서 이어받기
            fail.append((code, repr(e)[:80]))
        time.sleep(args.delay)
        if i % 100 == 0:
            print(f"{i}/{len(codes)} 실패 {len(fail)}", flush=True)
    print(f"done {len(codes)}, 실패 {len(fail)}")
    for c, e in fail[:20]:
        print(" ", c, e)


if __name__ == "__main__":
    main()
