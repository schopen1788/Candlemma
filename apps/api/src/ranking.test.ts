import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { app } from './app';
import { config } from './config';
import { normalizeNickname } from './ranking';
import { pickCounts } from './puzzle-result';

// Real local D1/SQLite via the existing Wrangler runtime, never the production DB.
let mf: Miniflare;
let db: D1Database;
let cookie = '';
const headers = () => ({ 'content-type': 'application/json', cookie });
async function request(path: string, data?: unknown, extra: Record<string, string> = {}) {
  const res = await app.request(`https://candlemma.test/api${path}`, {
    method: data === undefined ? 'GET' : 'POST', headers: { ...headers(), ...extra },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }, { DB: db, TOKEN_SECRET: 'test-secret' });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json() as any, response: res };
}
async function start() {
  const r = await request('/game/start', {});
  expect(r.status).toBe(200);
  return r.data;
}
async function answer(view: any, correct = true) {
  const q = await db.prepare('SELECT answer, key_tags FROM game_questions WHERE id = ?')
    .bind(view.question.puzzle_id).first<{ answer: string; key_tags: string }>();
  return request('/game/answer', { game_id: view.game.id, question_id: view.question.puzzle_id,
    pick: correct ? q!.answer : 'down', tags: [correct ? JSON.parse(q!.key_tags)[0] : config.tags[1]] });
}
async function complete(correct = true) {
  let v = await start();
  for (let i = 0; i < 10; i++) {
    const r = await answer(v, correct);
    expect(r.status).toBe(200);
    v = r.data;
    if (i < 9) v = (await request('/game/next', { game_id: v.game.id })).data;
  }
  return v;
}

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2025-09-01', d1Databases: ['DB'] }));
  db = await mf.getD1Database('DB') as unknown as D1Database;
  for (const name of ['0001_init.sql', '0002_guest_ranking.sql']) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    // D1 exec is line-oriented: each complete statement (including the trigger) is on one line.
    const clean = sql.replace(/--[^\n]*/g, '').trim();
    const triggers = clean.match(/CREATE TRIGGER[\s\S]*?END;/g) ?? [];
    const statements = [...clean.replace(/CREATE TRIGGER[\s\S]*?END;/g, '').split(';').filter(s => s.trim()).map(s => s + ';'), ...triggers];
    await db.exec(statements.map(s => s.replace(/\s+/g, ' ').trim()).join('\n'));
  }
  for (let i = 0; i < 12; i++) {
    const id = `fixture-${i}`;
    const bars = Array.from({ length: 120 }, (_, n) => ({ d: n - 119, o: 0, h: 2, l: -2, c: 0, tv: 100 }));
    const pub = { puzzle_id: id, mode_hint: 'practice', horizon: 3, flat_band: 2, market: 'KOSPI', sector: '',
      bars, ma: {}, tv_ma20: Array(120).fill(100), replay_from: -39, info: { themes: [], items: [] }, tags: config.tags };
    const ans = { answers: { '3': 'up' }, key_tags: [config.tags[0]], changes: { '3': 5 }, future_bars: bars.slice(0, 13),
      future_ma: {}, future_tv_ma20: Array(13).fill(100), pattern: 'fixture', pattern_name: '테스트', explain: '테스트',
      name: '테스트 종목', code: '000001', date: '2025-01-01', close_d0: 10000, dates: [] };
    await db.batch([
      db.prepare('INSERT INTO puzzles_public (id,payload,pattern,horizon,market,rating) VALUES (?,?,?,?,?,?)')
        .bind(id, JSON.stringify(pub), 'fixture', 3, 'KOSPI', 1500),
      db.prepare('INSERT INTO puzzles_answer (id,payload) VALUES (?,?)').bind(id, JSON.stringify(ans)),
    ]);
  }
}, 30_000);

beforeEach(async () => {
  cookie = '';
  await db.exec('DELETE FROM ranking_entries;\nDELETE FROM game_answers;\nDELETE FROM game_questions;\nDELETE FROM game_sessions;\nDELETE FROM anonymous_visitors;\nDELETE FROM request_limits;\nDELETE FROM submissions;\nDELETE FROM opens;');
});
afterAll(async () => { await mf?.dispose(); });

describe('guest ranking API with local D1', () => {
  it('issues a secure cookie, hides answers, resumes a unique active game', async () => {
    const r = await request('/game/start', {});
    expect(r.status).toBe(200);
    expect(r.response.headers.get('set-cookie')).toMatch(/__Host-candlemma=.*HttpOnly.*Secure.*SameSite=Lax/i);
    expect(r.response.headers.get('cache-control')).toBe('no-store');
    expect(r.data.question.puzzle_id).not.toContain('fixture');
    expect(r.data.question.answer).toBeUndefined();
    expect(r.data.question.future_bars).toBeUndefined();
    expect(r.data.result).toBeNull();
    const views = await Promise.all([start(), start()]);
    expect(views.every(v => v.game.id === r.data.game.id)).toBe(true);
    const rows = await db.prepare('SELECT COUNT(*) AS n FROM game_questions').first<{ n: number }>();
    expect(rows!.n).toBe(10);
  });

  it('scores ten answers on the server; opt-in only, public ranking and private ownership', async () => {
    const v = await complete();
    expect(v.game).toMatchObject({ state: 'complete', score: 1200, correct_count: 10, accuracy: 100, answered_count: 10 });
    expect((await request('/ranking')).data.entries).toHaveLength(0);
    const source = await db.prepare('SELECT puzzle_id FROM game_questions WHERE id = ?').bind(v.question.puzzle_id).first<{ puzzle_id: string }>();
    expect(await pickCounts(db, source!.puzzle_id)).toEqual({});
    const registered = await request('/ranking/submit', { game_id: v.game.id, nickname: '차트 독자' });
    expect(registered.status).toBe(200);
    expect(registered.data).toMatchObject({ updated: true, me: { rank: 1, score: 1200 } });
    expect(await pickCounts(db, source!.puzzle_id)).toEqual({ up: 1 });
    expect((await request('/ranking/me')).data.me.nickname).toBe('차트 독자');
    const ownerCookie = cookie;
    cookie = '';
    const publicList = await request('/ranking');
    expect(publicList.data.entries).toHaveLength(1);
    expect(publicList.data.me).toBeNull();
    expect(publicList.data.entries[0].visitor_id).toBeUndefined();
    expect((await request(`/game/${v.game.id}`)).status).toBe(403);
    await start();
    expect((await request(`/game/${v.game.id}`)).status).toBe(404);
    cookie = ownerCookie;
    expect((await request('/ranking/me')).data.me.rank).toBe(1);
  });

  it('rejects arbitrary scores, invalid payloads, incomplete registration, and duplicate/concurrent answers', async () => {
    const v = await start();
    expect((await request('/game/answer', { game_id: v.game.id, question_id: v.question.puzzle_id, score: 99999 })).status).toBe(400);
    expect((await request('/ranking/submit', { game_id: v.game.id, nickname: '독자', score: 99999 })).status).toBe(400);
    expect((await request('/ranking/submit', { game_id: v.game.id, nickname: '독자' })).status).toBe(409);
    expect((await request('/game/start', [])).status).toBe(400);
    expect((await request('/game/start', null)).status).toBe(400);
    expect((await request('/game/answer', { game_id: v.game.id, question_id: v.question.puzzle_id, pick: 'up', tags: {} })).status).toBe(400);
    const results = await Promise.all([answer(v), answer(v)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const restored = await request(`/game/${v.game.id}`);
    expect(restored.data.game).toMatchObject({ score: 120, answered_count: 1 });
    expect(restored.data.result.score).toBe(120);
    expect((await answer(v)).status).toBe(409);
  });

  it('cannot answer future/unissued questions or use the practice endpoint as a ranked answer oracle', async () => {
    const v = await start();
    const future = await db.prepare('SELECT id FROM game_questions WHERE game_id = ? AND ordinal = 2').bind(v.game.id).first<{ id: string }>();
    expect((await request('/game/answer', { game_id: v.game.id, question_id: future!.id, pick: 'up', tags: [config.tags[0]] })).status).toBe(409);
    expect((await request('/puzzles/submit', { open_token: v.question.puzzle_id, pick: 'up', tags: [config.tags[0]] })).status).toBe(403);
    const again = await request('/game/next', { game_id: v.game.id });
    expect(again.data.question).toEqual(v.question);
  });

  it('enforces timeout on the server and never resets a deadline on resume or next', async () => {
    const v = await start();
    await db.prepare('UPDATE game_questions SET issued_at = ? WHERE id = ?').bind(Date.now() - 121_000, v.question.puzzle_id).run();
    const resumed = await request(`/game/${v.game.id}`);
    const next = await request('/game/next', { game_id: v.game.id });
    expect(next.data.question.deadline).toBe(resumed.data.question.deadline);
    const a = await answer(v);
    expect(a.data.result).toMatchObject({ timed_out: true, correct: false, tag_hit: false, score: 0 });
    expect(a.data.game.score).toBe(0);
    const second = (await request('/game/next', { game_id: v.game.id })).data;
    await db.prepare('UPDATE game_questions SET issued_at = ? WHERE id = ?').bind(Date.now() - 121_000, second.question.puzzle_id).run();
    expect((await request('/game/answer', { game_id: v.game.id, question_id: second.question.puzzle_id, pick: null, tags: [] })).status).toBe(200);
  });

  it('keeps only the best opted-in score, permits duplicate nicknames, and rejects repeat registrations', async () => {
    const low = await complete(false);
    expect(low.game.score).toBe(0);
    await request('/ranking/submit', { game_id: low.game.id, nickname: '동명이인' });
    const high = await complete();
    const results = await Promise.all([
      request('/ranking/submit', { game_id: high.game.id, nickname: '동명이인' }),
      request('/ranking/submit', { game_id: high.game.id, nickname: '다른이름' }),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await request('/ranking')).data.entries).toHaveLength(1);
    const winningName = results.find(r => r.status === 200)!.data.me.nickname;
    const tie = await complete();
    const unchanged = await request('/ranking/submit', { game_id: tie.game.id, nickname: '바꾸려는이름' });
    expect(unchanged.data.updated).toBe(false);
    expect(unchanged.data.me.nickname).toBe(winningName);
    const lower = await complete(false);
    expect((await request('/ranking/submit', { game_id: lower.game.id, nickname: '낮은점수' })).data.updated).toBe(false);
    cookie = '';
    const other = await complete();
    await request('/ranking/submit', { game_id: other.game.id, nickname: winningName });
    const list = (await request('/ranking')).data;
    expect(list.entries.map((e: any) => e.nickname)).toEqual([winningName, winningName]);
    expect(list.me.rank).toBe(2);
  }, 20_000);

  it('validates nickname, origin, content type, body size and rejects repeated request bursts', async () => {
    for (const n of ['a', '가'.repeat(17), '<script>alert(1)</script>', 'a\nb', 'a\u200bb', '😀😀']) expect(normalizeNickname(n)).toBeNull();
    expect(normalizeNickname('  차트_독자 12  ')).toBe('차트_독자 12');
    expect(normalizeNickname('가나')).toBe('가나');
    expect((await request('/game/start', {}, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await request('/game/start', {}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await request('/game/start', {}, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await request('/game/start', { x: 'a'.repeat(5000) })).status).toBe(413);
    await db.prepare('INSERT INTO request_limits VALUES (?,180,?)').bind('unused', Date.now() + 60_000).run();
    // Use the exact current rate key created by a request, then exhaust its allowance atomically.
    await request('/ranking');
    await db.prepare("UPDATE request_limits SET count = 180 WHERE key LIKE 'ip:%'").run();
    const limited = await request('/ranking');
    expect(limited.status).toBe(429);
    expect(limited.response.headers.get('retry-after')).toBeTruthy();
  });

  it('returns exactly the top 100, stable tie order and my rank outside the top 100', async () => {
    const v = await complete(false);
    await request('/ranking/submit', { game_id: v.game.id, nickname: '내 기록' });
    for (let chunk = 0; chunk < 105; chunk += 10) {
      const statements: D1PreparedStatement[] = [];
      for (let i = chunk; i < Math.min(chunk + 10, 105); i++) {
        const id = `seed${String(i).padStart(3, '0')}`;
        statements.push(db.prepare('INSERT INTO anonymous_visitors VALUES (?,0)').bind(id));
        statements.push(db.prepare(`INSERT INTO game_sessions
          (id,visitor_id,season_id,state,answered_count,correct_count,score,created_at,expires_at,completed_at,registered_at)
          VALUES (?,?,'all-v1','complete',10,10,1200,0,9999999999999,1,1)`).bind(id, id));
        statements.push(db.prepare("INSERT INTO ranking_entries VALUES ('all-v1',?,?,?,1200,10,1)").bind(id, id, id));
      }
      await db.batch(statements);
    }
    const list = (await request('/ranking')).data;
    expect(list.total).toBe(106);
    expect(list.entries).toHaveLength(100);
    expect(list.entries[0]).toMatchObject({ rank: 1, nickname: 'seed000' });
    expect(list.entries[99]).toMatchObject({ rank: 100, nickname: 'seed099' });
    expect(list.me.rank).toBe(106);
  }, 15_000);

  it('rejects expired sessions and applies the per-visitor start limit', async () => {
    const v = await start();
    await db.prepare('UPDATE game_sessions SET expires_at = 0 WHERE id = ?').bind(v.game.id).run();
    expect((await answer(v)).status).toBe(410);
    const keys = await db.prepare("SELECT key FROM request_limits WHERE key LIKE 'start:%'").all<{ key: string }>();
    await db.prepare('UPDATE request_limits SET count = 10 WHERE key = ?').bind(keys.results[0].key).run();
    expect((await request('/game/start', {})).status).toBe(429);
  });

  it('preserves the existing unlimited practice flow and one-use tokens', async () => {
    const opened = await request('/puzzles/open', { context: 'practice', filters: {}, exclude: [], user_id: 'legacy' });
    expect(opened.status).toBe(200);
    const payload = { open_token: opened.data.open_token, pick: 'up', tags: [config.tags[0]] };
    const result = await request('/puzzles/submit', payload);
    expect(result.data).toMatchObject({ score: 120, correct: true, tag_hit: true });
    expect(result.data.reveal.bars).toHaveLength(13);
    expect((await request('/puzzles/submit', payload)).status).toBe(409);
  });
});
