"""공개용 JSON 에 D0 이후 데이터가 없음을 검사."""
import json

import pandas as pd
import pytest

from common import EXPORT, judge_cfg, patterns_cfg
from lib import add_features, judge
from tests.test_patterns import flat_series

export = __import__("10_export")


def make_public():
    f = add_features(flat_series())
    i = 250
    r = {"idx": i, "horizon": 1, "code": "000000", "ans_1": "up", "ans_3": "up", "ans_5": "flat",
         "chg_1": 1.2, "chg_3": 2.5, "chg_5": 0.1, "pattern": "new_high", "sub_patterns": [],
         "key_tags": ["신고가 돌파"], "explain": "x", "difficulty_init": 1500}
    pub, ans = export.build(r, f, {"market": "KOSPI", "sector": "기타", "name": "테스트"},
                            judge_cfg(), patterns_cfg(), ["a"], "pz_test")
    return f, i, pub, ans


def test_build_has_no_future():
    f, i, pub, ans = make_public()
    assert pub["flat_band"] == 0.5
    assert pub["judge_version"] == judge_cfg()["version"]
    assert [b["d"] for b in pub["bars"]] == list(range(-119, 1))
    assert pub["bars"][-1]["c"] == 0.0
    for arr in list(pub["ma"].values()) + [pub["tv_ma20"]]:
        assert len(arr) == 120
    text = json.dumps(pub)
    for k in ("code", "name", "date", "answers", "changes", "future", "key_tags", "pattern"):
        assert f'"{k}' not in text
    assert all(b["d"] > 0 for b in ans["future_bars"])
    # D0 이후 실제 종가가 공개용 어디에도 숫자로 들어가지 않음 (D+1 % 값 검사)
    c0 = f.at[i, "c"]
    nxt = round((f.at[i + 1, "c"] / c0 - 1) * 100, 2)
    assert all(b["c"] != nxt or b["d"] <= 0 for b in pub["bars"])


EXPORTED = EXPORT / "puzzles.jsonl"


@pytest.mark.skipif(not EXPORTED.exists(), reason="export 결과 없음")
def test_exported_public_has_no_future_and_balanced():
    per = {}
    with open(EXPORTED, encoding="utf-8") as fh:
        for line in fh:
            p = json.loads(line)
            pub = p["public"]
            assert max(b["d"] for b in pub["bars"]) == 0
            assert all(it["d"] <= 0 for it in pub["info"]["items"])
            for k in ("answer", "answers", "future_bars", "key_tags", "code", "name", "date"):
                assert k not in pub
            ans = p["answer"]["answers"][str(p["horizon"])]
            assert pub["flat_band"] == judge_cfg()["horizons"][p["horizon"]]
            assert pub["judge_version"] == judge_cfg()["version"]
            for h, band in judge_cfg()["horizons"].items():
                assert p["answer"]["answers"][str(h)] == judge(p["answer"]["changes"][str(h)], band)
            assert "보합 범위 ±0.5%" in p["answer"]["explain"]
            per.setdefault(p["pattern"], []).append(ans)
    for pat, answers in per.items():
        assert len(answers) >= 200, pat
        s = pd.Series(answers).value_counts(normalize=True)
        assert s.between(0.25, 0.40).all(), (pat, s.to_dict())
