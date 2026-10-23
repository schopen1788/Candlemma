"""Re-seeding must preserve the immutable puzzles referenced by ranked games."""
import json
import sqlite3
from pathlib import Path

upload = __import__("11_upload")


def test_reseed_preserves_ranked_question_and_retired_puzzles(tmp_path, monkeypatch):
    monkeypatch.setattr(upload, "EXPORT", tmp_path)
    monkeypatch.setattr("sys.argv", ["11_upload.py"])
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    migrations = Path(__file__).resolve().parents[2] / "apps" / "api" / "migrations"
    for migration in sorted(migrations.glob("*.sql")):
        conn.executescript(migration.read_text(encoding="utf-8"))

    def puzzle(pid, text):
        return {"id": pid, "pattern": "test", "horizon": 3, "market": "KOSPI", "rating": 1500,
                "public": {"text": text}, "answer": {"text": text}}

    def seed(puzzles):
        (tmp_path / "puzzles.jsonl").write_text("\n".join(json.dumps(p) for p in puzzles), encoding="utf-8")
        (tmp_path / "pattern_stats.json").write_text("[]", encoding="utf-8")
        upload.main()
        conn.executescript((tmp_path / "seed.sql").read_text(encoding="utf-8"))

    seed([puzzle("kept", "original"), puzzle("retired", "old")])
    conn.execute("UPDATE puzzles_public SET play_count = 7 WHERE id = 'kept'")
    conn.execute("INSERT INTO anonymous_visitors VALUES ('visitor',0)")
    conn.execute("INSERT INTO game_sessions (id,visitor_id,season_id,created_at,expires_at) VALUES ('game','visitor','all-v1',0,9999999999999)")
    conn.execute("INSERT INTO game_questions VALUES ('q','game',1,'kept','up','[]',1)")
    seed([puzzle("kept", "changed payload"), puzzle("new-version", "new")])
    original, plays, active = conn.execute("SELECT payload,play_count,active FROM puzzles_public WHERE id='kept'").fetchone()
    assert json.loads(original)["text"] == "original"
    assert plays == 7 and active == 1
    assert json.loads(conn.execute("SELECT payload FROM puzzles_answer WHERE id='kept'").fetchone()[0])["text"] == "original"
    assert conn.execute("SELECT active FROM puzzles_public WHERE id='retired'").fetchone()[0] == 0
    assert conn.execute("SELECT active FROM puzzles_public WHERE id='new-version'").fetchone()[0] == 1
    assert conn.execute("SELECT puzzle_id FROM game_questions WHERE id='q'").fetchone()[0] == "kept"
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
