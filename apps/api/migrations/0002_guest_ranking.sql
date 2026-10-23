-- Independent of the future login/rating tables in 0001. Nicknames are not identities.
CREATE TABLE anonymous_visitors (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE ranking_seasons (
  id TEXT PRIMARY KEY,
  rules_version TEXT NOT NULL,
  question_count INTEGER NOT NULL CHECK (question_count = 10),
  horizon INTEGER NOT NULL,
  question_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO ranking_seasons VALUES ('all-v1', 'direction100-tag20-v1', 10, 3, 120000, 0);

CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES anonymous_visitors(id),
  season_id TEXT NOT NULL REFERENCES ranking_seasons(id),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','complete','expired')),
  answered_count INTEGER NOT NULL DEFAULT 0 CHECK (answered_count BETWEEN 0 AND 10),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count BETWEEN 0 AND 10),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1200),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  registered_at INTEGER
);
CREATE UNIQUE INDEX idx_game_active ON game_sessions(visitor_id, season_id) WHERE state = 'active';
CREATE INDEX idx_game_history ON game_sessions(visitor_id, created_at DESC);
CREATE TABLE game_questions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  puzzle_id TEXT NOT NULL REFERENCES puzzles_public(id),
  answer TEXT NOT NULL CHECK (answer IN ('up','flat','down')),
  key_tags TEXT NOT NULL,
  issued_at INTEGER,
  UNIQUE (game_id, ordinal),
  UNIQUE (game_id, puzzle_id)
);
CREATE TABLE game_answers (
  question_id TEXT PRIMARY KEY REFERENCES game_questions(id) ON DELETE CASCADE,
  pick TEXT CHECK (pick IN ('up','flat','down')),
  tags TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0,1)),
  tag_hit INTEGER NOT NULL CHECK (tag_hit IN (0,1)),
  timed_out INTEGER NOT NULL CHECK (timed_out IN (0,1)),
  score INTEGER NOT NULL CHECK (score = 100 * correct + 20 * tag_hit),
  created_at INTEGER NOT NULL,
  CHECK (timed_out = 0 OR (correct = 0 AND tag_hit = 0))
);
CREATE INDEX idx_game_question_puzzle ON game_questions(puzzle_id);
-- The single answer insert and its aggregate update commit together, including under races.
CREATE TRIGGER game_answer_progress AFTER INSERT ON game_answers BEGIN
  UPDATE game_sessions SET
    answered_count = answered_count + 1,
    correct_count = correct_count + NEW.correct,
    score = score + NEW.score,
    state = CASE WHEN answered_count = 9 THEN 'complete' ELSE 'active' END,
    completed_at = CASE WHEN answered_count = 9 THEN NEW.created_at ELSE NULL END
  WHERE id = (SELECT game_id FROM game_questions WHERE id = NEW.question_id);
END;
CREATE TABLE ranking_entries (
  season_id TEXT NOT NULL REFERENCES ranking_seasons(id),
  visitor_id TEXT NOT NULL REFERENCES anonymous_visitors(id),
  game_id TEXT NOT NULL UNIQUE REFERENCES game_sessions(id),
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 2 AND 16),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1200),
  correct_count INTEGER NOT NULL CHECK (correct_count BETWEEN 0 AND 10),
  registered_at INTEGER NOT NULL,
  PRIMARY KEY (season_id, visitor_id)
);
CREATE INDEX idx_ranking_order ON ranking_entries(season_id, score DESC, correct_count DESC, registered_at ASC, visitor_id ASC);
CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_limits_expiry ON request_limits(expires_at);
