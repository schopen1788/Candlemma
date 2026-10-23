-- PLAN.md 9.3. Phase 1 에서 쓰는 테이블 + 이후 Phase 용 테이블.
-- puzzles_public.market: 연습 모드 시장 필터용으로 추가한 열.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, nickname TEXT UNIQUE NOT NULL,
  auth_provider TEXT, created_at INTEGER NOT NULL,
  rating REAL DEFAULT 1500, rd REAL DEFAULT 350, vol REAL DEFAULT 0.06,
  rated_count INTEGER DEFAULT 0, flagged INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS puzzles_public (
  id TEXT PRIMARY KEY, payload TEXT NOT NULL,
  pattern TEXT NOT NULL, horizon INTEGER NOT NULL, market TEXT,
  rating REAL NOT NULL, rd REAL DEFAULT 250, vol REAL DEFAULT 0.06,
  play_count INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS puzzles_answer (
  id TEXT PRIMARY KEY REFERENCES puzzles_public(id),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pattern_stats (
  pattern TEXT, horizon INTEGER, n INTEGER, up REAL, flat REAL, down REAL,
  PRIMARY KEY (pattern, horizon)
);
CREATE TABLE IF NOT EXISTS daily_sets (
  date TEXT PRIMARY KEY, number INTEGER UNIQUE, puzzle_ids TEXT NOT NULL, opens_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS opens (
  token TEXT PRIMARY KEY, user_id TEXT, puzzle_id TEXT, context TEXT,
  opened_at INTEGER, used INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, user_id TEXT, puzzle_id TEXT, context TEXT, context_ref TEXT,
  pick TEXT, tags TEXT, correct INTEGER, tag_hit INTEGER, score INTEGER,
  elapsed_ms INTEGER, rating_before REAL, rating_after REAL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS leagues ( id TEXT PRIMARY KEY, name TEXT, code TEXT UNIQUE, owner_id TEXT, created_at INTEGER );
CREATE TABLE IF NOT EXISTS league_members ( league_id TEXT, user_id TEXT, joined_at INTEGER, PRIMARY KEY (league_id, user_id) );
CREATE TABLE IF NOT EXISTS duels (
  id TEXT PRIMARY KEY, puzzle_ids TEXT, creator_id TEXT, opponent_id TEXT,
  creator_score INTEGER, opponent_score INTEGER, expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS notes ( id TEXT PRIMARY KEY, user_id TEXT, puzzle_id TEXT, text TEXT, created_at INTEGER );
CREATE INDEX IF NOT EXISTS idx_sub_user ON submissions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sub_ctx ON submissions(context, context_ref, score);
CREATE INDEX IF NOT EXISTS idx_sub_puzzle ON submissions(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_pub_filter ON puzzles_public(active, pattern, horizon, market);
