import { config, type Pick } from './config';
import { distribution } from './grade';

export async function pickCounts(db: D1Database, puzzleId: string) {
  const counts = await db.prepare(`SELECT pick, SUM(n) AS n FROM (
    SELECT pick, COUNT(*) AS n FROM submissions WHERE puzzle_id = ? GROUP BY pick
    UNION ALL
    SELECT a.pick, COUNT(*) AS n FROM game_answers a JOIN game_questions q ON q.id = a.question_id
    JOIN game_sessions g ON g.id = q.game_id
    WHERE q.puzzle_id = ? AND a.pick IS NOT NULL AND g.registered_at IS NOT NULL GROUP BY a.pick
  ) GROUP BY pick`).bind(puzzleId, puzzleId).all<{ pick: Pick; n: number }>();
  return Object.fromEntries(counts.results.map(r => [r.pick, r.n])) as Partial<Record<Pick, number>>;
}

export async function puzzleResult(db: D1Database, puzzleId: string,
  g: { correct: boolean; tagHit: boolean; score: number }, pick: Pick | null, tags: string[]) {
  const [pub, ans] = await Promise.all([
    db.prepare('SELECT horizon FROM puzzles_public WHERE id = ?').bind(puzzleId).first<{ horizon: number }>(),
    db.prepare('SELECT payload FROM puzzles_answer WHERE id = ?').bind(puzzleId).first<{ payload: string }>(),
  ]);
  if (!pub || !ans) throw new Error('Missing puzzle');
  const a = JSON.parse(ans.payload);
  const h = String(pub.horizon);
  const [stat, counts] = await Promise.all([
    db.prepare('SELECT n, up, flat, down FROM pattern_stats WHERE pattern = ? AND horizon = ?')
      .bind(a.pattern, pub.horizon).first(),
    pickCounts(db, puzzleId),
  ]);
  const reveal = pub.horizon + config.replay.reveal_extra;
  const p = config.patterns.find(x => x.id === a.pattern);
  return {
    correct: g.correct, tag_hit: g.tagHit, score: g.score, pick, my_tags: tags,
    answer: a.answers[h], change: a.changes[h], horizon: pub.horizon,
    flat_band: config.horizons[h], key_tags: a.key_tags, explain: a.explain,
    disclosures: a.disclosures ?? [], pattern: { id: a.pattern, name: a.pattern_name, desc: p?.desc ?? '' },
    stats: stat, distribution: distribution(counts),
    reveal: {
      bars: a.future_bars.slice(0, reveal),
      ma: Object.fromEntries(Object.entries(a.future_ma as Record<string, (number | null)[]>).map(([k, arr]) => [k, arr.slice(0, reveal)])),
      tv_ma20: a.future_tv_ma20.slice(0, reveal),
    },
    stock: { name: a.name, code: a.code, date: a.date, close_d0: a.close_d0, dates: a.dates.slice(0, 120 + reveal) },
  };
}
