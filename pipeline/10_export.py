"""10. 문제 JSON 생성 (공개용/정답용 분리) → data/export/puzzles.jsonl

공개용(public)에는 D0 이후 데이터가 절대 들어가지 않는다 (tests/test_export.py 로 검사).
puzzle_id 는 종목·날짜로 역산할 수 없도록 비밀 salt 로 만든다.
"""
import hashlib
import json
import secrets

import pandas as pd

from common import DATA, EXPORT, RAW, judge_cfg, patterns_cfg, tags_list
from lib import LOOKBACK, normalize_bars, normalize_series

FEAT = DATA / "features"
SALT_FILE = DATA / ".salt"


def salt() -> str:
    if not SALT_FILE.exists():
        SALT_FILE.write_text(secrets.token_hex(16))
    return SALT_FILE.read_text().strip()


def build(r: dict, f: pd.DataFrame, meta: dict, jcfg: dict, pcfg: dict, tags: list[str], pid: str):
    i, h = int(r["idx"]), int(r["horizon"])
    c0 = float(f.at[i, "c"])
    s, e = i - (LOOKBACK - 1), i
    fut_n = max(jcfg["horizons"]) + jcfg["replay"]["reveal_extra"]
    public = {
        "puzzle_id": pid,
        "mode_hint": "practice",
        "market": meta["market"],
        "sector": meta["sector"],
        "horizon": h,
        "flat_band": jcfg["horizons"][h],
        "judge_version": jcfg["version"],
        "bars": normalize_bars(f, s, e, c0, i),
        "ma": {str(n): normalize_series(f[f"ma{n}"], s, e, c0) for n in (5, 20, 60)},
        "tv_ma20": [round(float(v), 1) for v in f["tvma20"].iloc[s:e + 1]],
        "replay_from": -(jcfg["replay"]["replay_days"] - 1),
        "info": {"themes": [], "items": json.loads(r.get("info_items") or "[]")},
        "tags": tags,
    }
    answer = {
        "puzzle_id": pid,
        "code": r["code"],
        "name": meta["name"],
        "date": pd.Timestamp(f.at[i, "date"]).strftime("%Y-%m-%d"),
        "close_d0": round(c0),
        "future_bars": normalize_bars(f, i + 1, i + fut_n, c0, i),
        "future_ma": {str(n): normalize_series(f[f"ma{n}"], i + 1, i + fut_n, c0) for n in (5, 20, 60)},
        "future_tv_ma20": [round(float(v), 1) for v in f["tvma20"].iloc[i + 1:i + fut_n + 1]],
        "dates": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in f["date"].iloc[s:i + fut_n + 1]],
        "answers": {str(k): r[f"ans_{k}"] for k in jcfg["horizons"]},
        "changes": {str(k): float(r[f"chg_{k}"]) for k in jcfg["horizons"]},
        "pattern": r["pattern"],
        "pattern_name": pcfg["patterns"][r["pattern"]]["name"],
        "sub_patterns": list(r["sub_patterns"]),
        "key_tags": list(r["key_tags"]),
        "explain": r["explain"],
        # 원문 공시 제목·링크는 제출 후 결과 화면에서만
        "disclosures": [
            {"d": x["d"], "date": f"{x['date'][:4]}-{x['date'][4:6]}-{x['date'][6:]}", "title": x["title"],
             "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={x['rcept_no']}"}
            for x in json.loads(r.get("disclosures_raw") or "[]")
        ],
        "pattern_stat_ref": f"{r['pattern']}:{h}",
        "difficulty_init": int(r["difficulty_init"]),
    }
    return public, answer


def main():
    jcfg, pcfg, tags = judge_cfg(), patterns_cfg(), tags_list()
    uni = pd.read_parquet(RAW / "universe.parquet").set_index("code")
    sp = pd.read_parquet(DATA / "sampled.parquet")
    sl = salt()
    n = 0
    with open(EXPORT / "puzzles.jsonl", "w", encoding="utf-8") as out:
        for code, g in sp.groupby("code"):
            f = pd.read_parquet(FEAT / f"{code}.parquet")
            meta = uni.loc[code]
            for _, r in g.iterrows():
                # New judging rules must never overwrite a puzzle referenced by past games/tokens.
                key = f"{sl}:{jcfg['version']}:{code}:{int(r['idx'])}:{int(r['horizon'])}"
                pid = "pz_" + hashlib.sha256(key.encode()).hexdigest()[:10]
                public, answer = build(r.to_dict(), f, meta, jcfg, pcfg, tags, pid)
                out.write(json.dumps({
                    "id": pid, "pattern": r["pattern"], "horizon": int(r["horizon"]),
                    "market": meta["market"], "rating": int(r["difficulty_init"]),
                    "public": public, "answer": answer,
                }, ensure_ascii=False) + "\n")
                n += 1
    stats = json.loads((DATA / "pattern_stats.json").read_text(encoding="utf-8"))
    (EXPORT / "pattern_stats.json").write_text(json.dumps(stats, ensure_ascii=False), encoding="utf-8")
    print(f"exported {n} puzzles")


if __name__ == "__main__":
    main()
