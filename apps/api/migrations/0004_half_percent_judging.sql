-- Preserve previous ranking scores and historical pattern statistics.
INSERT INTO ranking_seasons (id, rules_version, question_count, horizon, question_ms, created_at)
VALUES ('all-observations-flat05-v3', 'direction100-observations20-flat05-v3', 10, 3, 120000, 1792774800000);
CREATE TABLE pattern_stats_versions (
  judge_version TEXT NOT NULL,
  pattern TEXT NOT NULL,
  horizon INTEGER NOT NULL,
  n INTEGER NOT NULL,
  up REAL NOT NULL,
  flat REAL NOT NULL,
  down REAL NOT NULL,
  PRIMARY KEY (judge_version, pattern, horizon)
);
