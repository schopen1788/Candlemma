-- Remove only the two retired leaderboards. Keep current scores and game history.
DELETE FROM ranking_entries WHERE season_id IN ('all-v1', 'all-observations-v2');
