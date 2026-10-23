"""공시 표시: 변환표 문구만 노출되고 회사 이름이 새지 않는지 검사."""
import json
import re

import pandas as pd
import pytest

from common import EXPORT, RAW, load_yaml
from lib import classify_disclosure, disclosure_items, normalize_title

CFG = load_yaml("disclosures.yaml")
RULES = CFG["rules"]


def test_normalize_prefix_and_spaces():
    assert normalize_title("[기재정정] 유상증자 결정") == ("유상증자결정", True)
    assert normalize_title("[첨부추가]단일판매ㆍ공급계약체결") == ("단일판매ㆍ공급계약체결", False)


@pytest.mark.parametrize("raw,label", [
    ("주요사항보고서(유상증자결정)", "유상증자 결정"),
    ("주요사항보고서(자회사의주요경영사항)(가나다바이오)", "자회사 주요경영사항"),
    ("타법인주식및출자증권취득결정(라마바테크)", "타법인 주식 취득 결정"),
    ("[기재정정]단일판매ㆍ공급계약체결", "단일판매·공급계약 체결"),
    ("연결재무제표기준영업(잠정)실적(공정공시)", "잠정 실적 발표"),
])
def test_classify_uses_fixed_label(raw, label):
    c = classify_disclosure(raw, RULES)
    assert c and c["label"] == label


def test_hidden_and_unknown():
    assert classify_disclosure("임원ㆍ주요주주특정증권등소유상황보고서", RULES) == {"hide": True}
    assert classify_disclosure("알수없는보고서(가나다전자)", RULES) is None


def test_items_never_contain_raw_title():
    discs = [
        {"d": 0, "title": "주요사항보고서(전환사채권발행결정)"},
        {"d": -2, "title": "타법인주식및출자증권취득결정(가나다전자)"},
        {"d": -3, "title": "임원ㆍ주요주주특정증권등소유상황보고서"},
        {"d": -5, "title": "가나다전자와의업무협약체결안내"},
        {"d": 3, "title": "유상증자결정"},  # 멈춘 날 이후 → 제외
    ]
    items, bad = disclosure_items(discs, CFG)
    texts = [x["text"] for x in items]
    assert texts == ["전환사채 발행 결정", "타법인 주식 취득 결정", "기타 공시 1건"]
    assert bad
    assert all(x["d"] <= 0 and x["url"] is None for x in items)
    assert "가나다" not in json.dumps(items, ensure_ascii=False)


def test_old_bad_disclosure_is_not_key_tag():
    _, bad = disclosure_items([{"d": -10, "title": "유상증자결정"}], CFG)
    assert not bad


EXPORTED = EXPORT / "puzzles.jsonl"
CORPS = RAW / "dart_corps.parquet"
ALLOWED = {r["label"] for r in RULES if "label" in r}


@pytest.mark.skipif(not EXPORTED.exists(), reason="export 결과 없음")
def test_exported_info_uses_only_fixed_labels_and_no_company_names():
    texts = set()
    with open(EXPORTED, encoding="utf-8") as fh:
        for line in fh:
            p = json.loads(line)
            for it in p["public"]["info"]["items"]:
                assert it["d"] <= 0 and it["url"] is None
                assert set(it) == {"d", "kind", "text", "url"}
                texts.add(it["text"])
    for t in texts:
        base = t.removesuffix(" (정정)")
        assert base in ALLOWED or re.fullmatch(r"기타 공시 \d+건", t), t
    names = set(pd.read_parquet(RAW / "universe.parquet")["name"])
    if CORPS.exists():
        names |= set(pd.read_parquet(CORPS)["corp_name"])
    # 변환표 문구 자체에 들어 있는 일반 단어형 법인명(예: '경영사'가 '주요경영사항'에 포함)은 누출이 아니다
    names = {n for n in names if isinstance(n, str) and len(n) >= 3 and not any(n in a for a in ALLOWED)}
    leaked = [(t, n) for t in texts for n in names if n in t]
    assert not leaked, leaked[:5]
