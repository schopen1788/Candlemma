"""파이프라인 공통 경로·설정 로더."""
from pathlib import Path
import sys

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
DATA = Path(__file__).resolve().parent / "data"
RAW = DATA / "raw"
DAILY = RAW / "daily"
EXPORT = DATA / "export"

for _d in (DATA, RAW, DAILY, EXPORT):
    _d.mkdir(parents=True, exist_ok=True)

# 윈도우 콘솔에서 한글 출력이 깨지지 않게
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def load_yaml(name: str) -> dict:
    with open(CONFIG / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def judge_cfg() -> dict:
    cfg = load_yaml("judge.yaml")
    cfg["horizons"] = {int(k): float(v) for k, v in cfg["horizons"].items()}
    return cfg


def patterns_cfg() -> dict:
    return load_yaml("patterns.yaml")


def tags_list() -> list[str]:
    return load_yaml("tags.yaml")["tags"]


def env(name: str) -> str | None:
    """pipeline/.env 의 KEY=VALUE 를 읽는다 (환경변수가 우선)."""
    import os
    if os.environ.get(name):
        return os.environ[name]
    p = Path(__file__).resolve().parent / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            k, _, v = line.strip().partition("=")
            if k == name and v:
                return v.strip().strip('"')
    return None
