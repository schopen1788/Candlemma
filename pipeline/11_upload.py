"""11. D1 업로드: export → seed.sql 생성 후 wrangler d1 execute 호출

사용: uv run python 11_upload.py --local   (로컬 개발 DB)
      uv run python 11_upload.py --remote  (Cloudflare D1)
"""
import argparse
import json
import subprocess

from common import EXPORT, ROOT

DB = "candlemma"
WEB = ROOT / "apps" / "web"


def q(s) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--local", action="store_true")
    g.add_argument("--remote", action="store_true")
    args = ap.parse_args()

    # Ranking sessions reference immutable puzzle IDs. Keep historical puzzles and
    # their answer payloads; retire them from selection instead of deleting them.
    lines = ["UPDATE puzzles_public SET active = 0;", "DELETE FROM pattern_stats;"]
    with open(EXPORT / "puzzles.jsonl", encoding="utf-8") as f:
        for line in f:
            p = json.loads(line)
            pub = json.dumps(p["public"], ensure_ascii=False, separators=(",", ":"))
            ans = json.dumps(p["answer"], ensure_ascii=False, separators=(",", ":"))
            lines.append(
                f"INSERT INTO puzzles_public (id, payload, pattern, horizon, market, rating) VALUES "
                f"({q(p['id'])}, {q(pub)}, {q(p['pattern'])}, {p['horizon']}, {q(p['market'])}, {p['rating']}) "
                "ON CONFLICT(id) DO UPDATE SET active = 1;")
            lines.append(f"INSERT INTO puzzles_answer (id, payload) VALUES ({q(p['id'])}, {q(ans)}) ON CONFLICT(id) DO NOTHING;")
    for s in json.loads((EXPORT / "pattern_stats.json").read_text(encoding="utf-8")):
        lines.append(
            f"INSERT INTO pattern_stats (pattern, horizon, n, up, flat, down) VALUES "
            f"({q(s['pattern'])}, {s['horizon']}, {s['n']}, {s['up']}, {s['flat']}, {s['down']});")
    seed = EXPORT / "seed.sql"
    seed.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"seed.sql: {len(lines)} statements, {seed.stat().st_size / 1e6:.1f} MB")

    if args.local or args.remote:
        flag = "--local" if args.local else "--remote"
        cmd = f'npx wrangler d1 execute {DB} {flag} --yes --file "{seed}"'
        subprocess.run(cmd, cwd=WEB, shell=True, check=True)


if __name__ == "__main__":
    main()
