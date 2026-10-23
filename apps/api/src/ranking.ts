import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { config, type Pick } from './config';
import { grade, validateSubmit } from './grade';
import { puzzleResult } from './puzzle-result';
import { observationFeedback, observedReasons, practiceGroups } from './observations';

type Bindings = { DB: D1Database; TOKEN_SECRET?: string };
type RankEnv = { Bindings: Bindings; Variables: { visitor: string | null } };
type Ctx = Context<RankEnv>;
const SEASON = 'all-observations-flat05-v3';
const OBSERVATION_SEASON = 'all-observations-v2';
const LEGACY_SEASON = 'all-v1';
function requestedSeason(c: Ctx) {
  const season = c.req.query('season') ?? SEASON;
  if (season === OBSERVATION_SEASON || season === LEGACY_SEASON) fail(410, '이전 랭킹은 종료됐어요. 전체 랭킹에서 새 도전을 시작해 주세요.');
  if (season !== SEASON) fail(400, '랭킹 기준이 올바르지 않아요.');
  return season;
}
const QUESTION_MS = 120_000;
const GAME_MS = 24 * 60 * 60 * 1000;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Game = {
  id: string; visitor_id: string; season_id: string; state: 'active' | 'complete' | 'expired';
  answered_count: number; correct_count: number; score: number; created_at: number;
  expires_at: number; completed_at: number | null; registered_at: number | null;
};
type Question = {
  id: string; game_id: string; ordinal: number; puzzle_id: string;
  answer: Pick; key_tags: string; issued_at: number | null;
};
type Answer = { pick: Pick | null; tags: string; correct: number; tag_hit: number; score: number; timed_out: number };
function fail(status: 400 | 403 | 404 | 409 | 410 | 429 | 503, message: string): never {
  throw new HTTPException(status, { message });
}
export async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

// Conditional UPSERT is atomic across isolates. Rejected requests do not keep writing.
export async function consumeLimit(db: D1Database, key: string, limit: number, expiresAt: number) {
  const row = await db.prepare(`INSERT INTO request_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
    .bind(key, expiresAt, limit).first();
  return !!row;
}

export async function limitRequest(c: Context<{ Bindings: Bindings }>) {
  const now = Date.now();
  const bucket = Math.floor(now / 60_000);
  // Cloudflare supplies this header in production. Never use it as the visitor identity.
  const address = c.req.header('cf-connecting-ip') ?? 'local';
  const key = await digest(`${c.env.TOKEN_SECRET ?? ''}|${bucket}|${address}`);
  if (!await consumeLimit(c.env.DB, `ip:${key}`, 180, (bucket + 1) * 60_000)) {
    c.header('Retry-After', String(Math.max(1, Math.ceil(((bucket + 1) * 60_000 - now) / 1000))));
    fail(429, '요청이 많아요. 잠시 후 다시 시도해 주세요.');
  }
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 4) {
    await c.env.DB.prepare(`DELETE FROM request_limits WHERE key IN
      (SELECT key FROM request_limits WHERE expires_at < ? LIMIT 100)`).bind(now).run();
  }
}

function cookieOptions(c: Ctx) {
  const url = new URL(c.req.url);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return { name: local ? 'candlemma_dev' : '__Host-candlemma', secure: !local };
}

async function visitor(c: Ctx, create = false): Promise<string | null> {
  const opts = cookieOptions(c);
  const token = getCookie(c, opts.name);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const id = await digest(token);
    if (await c.env.DB.prepare('SELECT id FROM anonymous_visitors WHERE id = ?').bind(id).first()) return id;
  }
  if (!create) return null;
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const id = await digest(raw);
  await c.env.DB.prepare('INSERT INTO anonymous_visitors (id, created_at) VALUES (?, ?)').bind(id, Date.now()).run();
  setCookie(c, opts.name, raw, { httpOnly: true, secure: opts.secure, sameSite: 'Lax', path: '/', maxAge: 365 * 24 * 60 * 60 });
  return id;
}

async function body(c: Ctx, allowed: string[]): Promise<Record<string, unknown>> {
  const data = await c.req.json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !allowed.includes(k))) {
    fail(400, '요청 형식이 올바르지 않아요.');
  }
  return data;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) fail(400, '게임 또는 문제 ID가 올바르지 않아요.');
  return value;
}
export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const n = value.normalize('NFC').trim();
  // Unicode letters/numbers, ordinary spaces, underscore. No markup or invisible/control characters.
  return Array.from(n).length >= 2 && Array.from(n).length <= 16 && /^[\p{L}\p{N}_ ]+$/u.test(n) ? n : null;
}
async function ownedGame(c: Ctx, gameId: string): Promise<Game> {
  const who = c.get('visitor');
  if (!who) fail(403, '이 브라우저의 게임을 찾을 수 없어요. 쿠키를 허용해 주세요.');
  const game = await c.env.DB.prepare('SELECT * FROM game_sessions WHERE id = ? AND visitor_id = ?')
    .bind(gameId, who).first<Game>();
  if (!game) fail(404, '이 브라우저의 게임을 찾을 수 없어요.');
  if (game.state === 'expired' || (game.state === 'active' && game.expires_at <= Date.now())) {
    await c.env.DB.prepare("UPDATE game_sessions SET state = 'expired' WHERE id = ? AND state = 'active'").bind(gameId).run();
    fail(410, '도전이 만료됐어요. 새 도전을 시작해 주세요.');
  }
  return game;
}

async function gameView(c: Ctx, game: Game) {
  const q = await c.env.DB.prepare('SELECT * FROM game_questions WHERE game_id = ? AND issued_at IS NOT NULL ORDER BY ordinal DESC LIMIT 1')
    .bind(game.id).first<Question>();
  if (!q) throw new Error('Missing issued question');
  const row = await c.env.DB.prepare('SELECT payload FROM puzzles_public WHERE id = ?').bind(q.puzzle_id).first<{ payload: string }>();
  if (!row) throw new Error('Missing puzzle');
  const chart = JSON.parse(row.payload);
  const detailed = game.season_id !== LEGACY_SEASON;
  const a = await c.env.DB.prepare('SELECT * FROM game_answers WHERE question_id = ?').bind(q.id).first<Answer>();
  let result = null;
  if (a) {
    result = { ...await puzzleResult(c.env.DB, q.puzzle_id,
      { correct: !!a.correct, tagHit: !!a.tag_hit, score: a.score }, a.pick, JSON.parse(a.tags)),
      answer: q.answer, key_tags: JSON.parse(q.key_tags), timed_out: !!a.timed_out,
      ...(detailed ? { evidence: observationFeedback(chart, JSON.parse(a.tags), JSON.parse(q.key_tags)) } : {}) };
  }
  const groups = detailed ? practiceGroups(chart) : undefined;
  return {
    game: { id: game.id, state: game.state, score: game.score, correct_count: game.correct_count,
      answered_count: game.answered_count, total: 10, accuracy: game.correct_count * 10, registered: game.registered_at !== null },
    rules: { season: game.season_id, horizon: 3, question_ms: QUESTION_MS, max_score: 1200 },
    server_now: Date.now(),
    question: { ...chart, ...(groups ? { tags: groups.flatMap(g => g.items.map(t => t.id)), reason_groups: groups } : {}), puzzle_id: q.id, open_token: '', ordinal: q.ordinal,
      deadline: q.issued_at! + QUESTION_MS },
    result,
  };
}

export const ranking = new Hono<RankEnv>();
ranking.use('*', async (c, next) => {
  c.set('visitor', await visitor(c));
  await next();
});

ranking.post('/game/start', async c => {
  const b = await body(c, ['observation_version']);
  if (b.observation_version !== undefined && b.observation_version !== 2) fail(400, '근거 버전이 올바르지 않아요.');
  // Observation-aware clients start the current season; existing games retain their own rules.
  const season = b.observation_version === 2 ? SEASON : LEGACY_SEASON;
  const who = c.get('visitor') ?? await visitor(c, true);
  c.set('visitor', who);
  const now = Date.now();
  await c.env.DB.prepare("UPDATE game_sessions SET state = 'expired' WHERE visitor_id = ? AND state = 'active' AND expires_at <= ?")
    .bind(who, now).run();
  let game = await c.env.DB.prepare("SELECT * FROM game_sessions WHERE visitor_id = ? AND season_id = ? AND state = 'active'")
    .bind(who, season).first<Game>();
  if (!game) {
    const hour = Math.floor(now / 3_600_000);
    if (!await consumeLimit(c.env.DB, `start:${who}:${hour}`, 10, (hour + 1) * 3_600_000)) {
      c.header('Retry-After', String(Math.ceil(((hour + 1) * 3_600_000 - now) / 1000)));
      fail(429, '새 도전은 한 시간에 10번까지 시작할 수 있어요.');
    }
    const pool = await c.env.DB.prepare(`SELECT p.id, p.payload, json_extract(a.payload, '$.answers."3"') AS answer,
      json_extract(a.payload, '$.key_tags') AS key_tags FROM puzzles_public p
      JOIN puzzles_answer a ON a.id = p.id WHERE p.horizon = 3 AND
        ((? = ? AND p.active = 1 AND json_extract(p.payload, '$.judge_version') = ?)
        OR (? = ? AND json_extract(p.payload, '$.judge_version') IS NULL AND json_extract(p.payload, '$.flat_band') = 2))
      ORDER BY RANDOM() LIMIT 10`)
      .bind(season, SEASON, config.judge_version, season, LEGACY_SEASON)
      .all<{ id: string; payload: string; answer: Pick; key_tags: string }>();
    if (pool.results.length < 10) fail(503, 'T+3 문제가 10개 이상 준비되면 도전을 시작할 수 있어요.');
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO game_sessions (id, visitor_id, season_id, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(id, who, season, now, now + GAME_MS),
      ...pool.results.map((p, i) => c.env.DB.prepare(`INSERT INTO game_questions
        (id, game_id, ordinal, puzzle_id, answer, key_tags, issued_at)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM game_sessions WHERE id = ?)`)
        .bind(crypto.randomUUID(), id, i + 1, p.id, p.answer,
          season === SEASON ? JSON.stringify(observedReasons(JSON.parse(p.payload))) : p.key_tags, i === 0 ? now : null, id)),
    ]);
    game = await c.env.DB.prepare("SELECT * FROM game_sessions WHERE visitor_id = ? AND season_id = ? AND state = 'active'")
      .bind(who, season).first<Game>();
  }
  return c.json(await gameView(c, game!));
});

ranking.get('/game/:id', async c => c.json(await gameView(c, await ownedGame(c, identifier(c.req.param('id'))))));

ranking.post('/game/next', async c => {
  const b = await body(c, ['game_id']);
  const game = await ownedGame(c, identifier(b.game_id));
  if (game.state !== 'active') fail(409, '이미 완료한 도전이에요.');
  const now = Date.now();
  await c.env.DB.prepare(`UPDATE game_questions SET issued_at = ? WHERE game_id = ? AND ordinal = ?
    AND issued_at IS NULL AND EXISTS (SELECT 1 FROM game_sessions WHERE id = ? AND state = 'active' AND expires_at > ?)`)
    .bind(now, game.id, game.answered_count + 1, game.id, now).run();
  // Repeating next cannot advance the ordinal or extend an already issued deadline.
  return c.json(await gameView(c, await ownedGame(c, game.id)));
});

ranking.post('/game/answer', async c => {
  const b = await body(c, ['game_id', 'question_id', 'pick', 'tags']);
  const game = await ownedGame(c, identifier(b.game_id));
  const q = await c.env.DB.prepare('SELECT * FROM game_questions WHERE id = ? AND game_id = ?')
    .bind(identifier(b.question_id), game.id).first<Question>();
  if (!q || !q.issued_at || q.ordinal !== game.answered_count + 1 || game.state !== 'active') {
    fail(409, '이미 제출했거나 현재 문제가 아니에요.');
  }
  const now = Date.now();
  const timedOut = now >= q.issued_at + QUESTION_MS;
  let pick: Pick | null = null;
  let tags: string[] = [];
  if (!(timedOut && b.pick === null && Array.isArray(b.tags) && b.tags.length === 0)) {
    if (typeof b.pick !== 'string' || !Array.isArray(b.tags) || b.tags.some(t => typeof t !== 'string')) fail(400, '판단과 근거를 확인해 주세요.');
    let allowed = config.tags;
    if (game.season_id !== LEGACY_SEASON) {
      const row = await c.env.DB.prepare('SELECT payload FROM puzzles_public WHERE id = ?').bind(q.puzzle_id).first<{ payload: string }>();
      if (!row) throw new Error('Missing puzzle');
      allowed = practiceGroups(JSON.parse(row.payload)).flatMap(g => g.items.map(t => t.id));
    }
    const v = validateSubmit({ pick: b.pick, tags: b.tags }, allowed);
    if (typeof v === 'string') fail(400, v);
    pick = v.pick;
    tags = v.tags;
  }
  const g = timedOut ? { correct: false, tagHit: false, score: 0 } : grade(pick!, tags, q.answer, JSON.parse(q.key_tags));
  const inserted = await c.env.DB.prepare(`INSERT INTO game_answers
    (question_id, pick, tags, correct, tag_hit, timed_out, score, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM game_sessions g JOIN game_questions q ON q.game_id = g.id
      WHERE g.id = ? AND g.state = 'active' AND g.expires_at > ? AND g.answered_count = ? AND q.id = ? AND q.issued_at IS NOT NULL
    ) ON CONFLICT(question_id) DO NOTHING`)
    .bind(q.id, pick, JSON.stringify(tags), +g.correct, +g.tagHit, +timedOut, g.score, now,
      game.id, now, q.ordinal - 1, q.id).run();
  if (!inserted.meta.changes) fail(409, '이미 제출했거나 만료된 문제예요.');
  return c.json(await gameView(c, await ownedGame(c, game.id)));
});

const ORDER = 'score DESC, correct_count DESC, registered_at ASC, visitor_id ASC';
async function myRanking(c: Ctx, season = SEASON) {
  if (!c.get('visitor')) return null;
  return c.env.DB.prepare(`SELECT e.nickname, e.score, e.correct_count, e.registered_at,
    10 AS total, e.correct_count * 10 AS accuracy,
    1 + (SELECT COUNT(*) FROM ranking_entries r WHERE r.season_id = e.season_id AND
      (r.score > e.score OR (r.score = e.score AND r.correct_count > e.correct_count) OR
       (r.score = e.score AND r.correct_count = e.correct_count AND r.registered_at < e.registered_at) OR
       (r.score = e.score AND r.correct_count = e.correct_count AND r.registered_at = e.registered_at AND r.visitor_id < e.visitor_id))) AS rank
    FROM ranking_entries e WHERE e.season_id = ? AND e.visitor_id = ?`)
    .bind(season, c.get('visitor')).first();
}

ranking.post('/ranking/submit', async c => {
  const b = await body(c, ['game_id', 'nickname']);
  const nickname = normalizeNickname(b.nickname);
  if (!nickname) fail(400, '닉네임은 한글·영문 등 문자, 숫자, 공백, 밑줄로 2~16자 입력해 주세요.');
  const game = await ownedGame(c, identifier(b.game_id));
  if (game.season_id !== SEASON) fail(410, '이전 랭킹은 종료됐어요. 새 도전을 완료한 뒤 등록해 주세요.');
  if (game.state !== 'complete' || game.answered_count !== 10) fail(409, '10문제를 모두 완료한 뒤 등록할 수 있어요.');
  if (game.registered_at !== null) fail(409, '이미 등록한 도전이에요.');
  const now = Date.now();
  // Both the conditional registration and representative-record replacement are one transaction.
  // A competing transaction sees registered_at already set and cannot rename or rewrite a record.
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO ranking_entries (season_id, visitor_id, game_id, nickname, score, correct_count, registered_at)
      SELECT season_id, visitor_id, id, ?, score, correct_count, ? FROM game_sessions
      WHERE id = ? AND visitor_id = ? AND state = 'complete' AND answered_count = 10 AND registered_at IS NULL
      ON CONFLICT(season_id, visitor_id) DO UPDATE SET
        game_id = excluded.game_id, nickname = excluded.nickname, score = excluded.score,
        correct_count = excluded.correct_count, registered_at = excluded.registered_at
      WHERE excluded.score > ranking_entries.score OR
        (excluded.score = ranking_entries.score AND excluded.correct_count > ranking_entries.correct_count)`)
      .bind(nickname, now, game.id, c.get('visitor')),
    c.env.DB.prepare(`UPDATE game_sessions SET registered_at = ? WHERE id = ? AND visitor_id = ?
      AND state = 'complete' AND answered_count = 10 AND registered_at IS NULL`).bind(now, game.id, c.get('visitor')),
  ]);
  if (!results[1].meta.changes) fail(409, '이미 등록한 도전이에요.');
  return c.json({ season: game.season_id, updated: results[0].meta.changes > 0, me: await myRanking(c, game.season_id) });
});

ranking.get('/ranking/me', async c => c.json({ me: await myRanking(c, requestedSeason(c)) }));
ranking.get('/ranking', async c => {
  const season = requestedSeason(c);
  const [list, count, me] = await Promise.all([
    c.env.DB.prepare(`SELECT nickname, score, correct_count, registered_at, visitor_id,
      10 AS total, correct_count * 10 AS accuracy FROM ranking_entries WHERE season_id = ? ORDER BY ${ORDER} LIMIT 100`)
      .bind(season).all<{ nickname: string; score: number; correct_count: number; registered_at: number; visitor_id: string }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM ranking_entries WHERE season_id = ?').bind(season).first<{ n: number }>(),
    myRanking(c, season),
  ]);
  return c.json({ season, total: count?.n ?? 0, me,
    entries: list.results.map(({ visitor_id, ...row }, i) => ({ ...row, rank: i + 1, is_me: visitor_id === c.get('visitor') })) });
});

ranking.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '랭킹 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' }, 500);
});
