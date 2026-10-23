"""07b. 출제 장면의 공시 수집 (OpenDART) → sampled.parquet 에 공시 열 추가

- 키: pipeline/.env 의 DART_API_KEY. 키가 없으면 이 단계는 건너뛴다 (PLAN.md 6.1).
- 멈춘 날 포함 직전 window_days 거래일의 공시만 받는다. 멈춘 날 이후 공시는 받지 않는다.
- 응답은 data/raw/dart/ 에 캐시해 재실행 시 다시 요청하지 않는다.
- 핵심 근거: D-4 ~ D0 에 악재 공시가 있으면 '악재 공시'를 넣는다.
"""
import io
import json
import time
import xml.etree.ElementTree as ET
import zipfile

import pandas as pd
import requests

from common import DATA, RAW, env, load_yaml
from lib import disclosure_items

FEAT = DATA / "features"
CACHE = RAW / "dart"
CACHE.mkdir(exist_ok=True)
CORPS = RAW / "dart_corps.parquet"
API = "https://opendart.fss.or.kr/api"
DELAY = 0.2


def corp_codes(key: str) -> pd.DataFrame:
    if CORPS.exists():
        return pd.read_parquet(CORPS)
    r = requests.get(f"{API}/corpCode.xml", params={"crtfc_key": key}, timeout=120)
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    root = ET.fromstring(z.read(z.namelist()[0]))
    df = pd.DataFrame([{
        "corp_code": x.findtext("corp_code"),
        "corp_name": (x.findtext("corp_name") or "").strip(),
        "stock_code": (x.findtext("stock_code") or "").strip(),
    } for x in root.findall("list")])
    df.to_parquet(CORPS, index=False)
    return df


def fetch_list(key: str, corp: str, bgn: str, end: str) -> list[dict]:
    path = CACHE / f"{corp}_{bgn}_{end}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    out, page = [], 1
    while True:
        j = requests.get(f"{API}/list.json", params={
            "crtfc_key": key, "corp_code": corp, "bgn_de": bgn, "end_de": end,
            "page_no": page, "page_count": 100,
        }, timeout=30).json()
        time.sleep(DELAY)
        if j["status"] == "013":  # 조회된 데이터 없음
            break
        if j["status"] != "000":
            raise RuntimeError(f"DART {j['status']} {j.get('message')}")
        out += [{k: it[k] for k in ("rcept_no", "report_nm", "rcept_dt")} for it in j["list"]]
        if page >= int(j.get("total_page", 1)):
            break
        page += 1
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def main():
    key = env("DART_API_KEY")
    if not key:
        print("DART_API_KEY 없음 → 공시 단계 건너뜀")
        return
    cfg = load_yaml("disclosures.yaml")
    corps = corp_codes(key)
    by_stock = dict(zip(corps["stock_code"], corps["corp_code"]))
    sp = pd.read_parquet(DATA / "sampled.parquet")
    items_col, raw_col, keys_col = [], [], []
    missing = 0
    for n, (_, r) in enumerate(sp.iterrows(), 1):
        f = pd.read_parquet(FEAT / f"{r['code']}.parquet", columns=["date"])
        dates = pd.to_datetime(f["date"]).dt.strftime("%Y%m%d").to_numpy()
        i = int(r["idx"])
        bgn, end = dates[i - (cfg["window_days"] - 1)], dates[i]
        corp = by_stock.get(r["code"])
        raw = fetch_list(key, corp, bgn, end) if corp else []
        missing += corp is None
        discs = []
        for it in raw:
            if not (bgn <= it["rcept_dt"] <= end):
                continue
            # 주말·휴일 접수분은 다음 거래일로 (멈춘 날을 넘지 않음)
            d = int(dates.searchsorted(it["rcept_dt"], side="left")) - i
            discs.append({"d": min(d, 0), "date": it["rcept_dt"], "title": it["report_nm"], "rcept_no": it["rcept_no"]})
        items, bad = disclosure_items(discs, cfg)
        keys = list(r["key_tags"])
        if bad and "악재 공시" not in keys:
            keys = keys[:1] + ["악재 공시"]
        items_col.append(json.dumps(items, ensure_ascii=False))
        raw_col.append(json.dumps(sorted(discs, key=lambda x: -x["d"])[:10], ensure_ascii=False))
        keys_col.append(keys)
        if n % 200 == 0:
            print(f"{n}/{len(sp)}", flush=True)
    sp["info_items"] = items_col
    sp["disclosures_raw"] = raw_col
    sp["key_tags"] = keys_col
    sp.to_parquet(DATA / "sampled.parquet", index=False)
    has = sum(1 for x in items_col if x != "[]")
    print(f"공시 있는 문제 {has}/{len(sp)}, 악재 공시 핵심 근거 {sum('악재 공시' in k for k in keys_col)}, DART 코드 없음 {missing}")


if __name__ == "__main__":
    main()
