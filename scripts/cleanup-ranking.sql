-- Optional maintenance. Run against LOCAL first and back up before REMOTE use.
-- One invocation removes at most 100 old non-representative games (answers cascade).
-- Keep every public best record and its source game indefinitely.
DELETE FROM game_sessions WHERE id IN (
  SELECT g.id FROM game_sessions g
  WHERE g.created_at < (unixepoch() - 30 * 86400) * 1000
    AND (g.state != 'active' OR g.expires_at < unixepoch() * 1000)
    AND NOT EXISTS (SELECT 1 FROM ranking_entries e WHERE e.game_id = g.id)
  LIMIT 100
);
DELETE FROM request_limits WHERE key IN (
  SELECT key FROM request_limits WHERE expires_at < unixepoch() * 1000 LIMIT 1000
);
