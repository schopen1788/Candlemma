-- Keep previous rankings intact: different observation rules have separate leaderboards.
INSERT INTO ranking_seasons (id, rules_version, question_count, horizon, question_ms, created_at)
VALUES ('all-observations-v2', 'direction100-observations20-v2', 10, 3, 120000, 1792710000000);
