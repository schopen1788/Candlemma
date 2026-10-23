import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { ranking, limitRequest } from "./ranking";
import { puzzleResult, pickCounts } from "./puzzle-result";
import { config, type Pick } from "./config";
import { distribution, grade, validateSubmit } from "./grade";
import { makeToken, verifyToken } from "./token";

export type Env = { DB: D1Database; TOKEN_SECRET?: string };

const MAX_EXCLUDE = 80;
const DEV_SECRET = "dev-only-secret";

export const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if ((origin && origin !== new URL(c.req.url).origin) || c.req.header("sec-fetch-site") === "cross-site")
      return c.json({ error: "같은 사이트에서 요청해 주세요." }, 403);
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      return c.json({ error: "JSON 요청이 필요해요." }, 415);
  }
  await next();
});
app.use("*", bodyLimit({ maxSize: 4096, onError: c => c.json({ error: "요청이 너무 커요." }, 413) }));
app.use("*", async (c, next) => {
  if (!c.req.path.endsWith("/meta") && !c.req.path.endsWith("/health")) await limitRequest(c);
  await next();
});
app.route("/", ranking);

const secret = (env: Env) => env.TOKEN_SECRET || DEV_SECRET;

async function readJson<T>(req: { json: () => Promise<T> }): Promise<Partial<T>> {
  try {
    return (await req.json()) ?? {};
  } catch {
    return {};
  }
}

app.get("/health", (c) => c.json({ ok: true }));

app.get("/meta", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT pattern, COUNT(*) AS n FROM puzzles_public WHERE active = 1 GROUP BY pattern",
  ).all<{ pattern: string; n: number }>();
  const counts = Object.fromEntries(rows.results.map((r) => [r.pattern, r.n]));
  return c.json({
    tags: config.tags,
    horizons: config.horizons,
    replay: config.replay,
    patterns: config.patterns.map((p) => ({ id: p.id, name: p.name, desc: p.desc, count: counts[p.id] ?? 0 })),
    markets: ["KOSPI", "KOSDAQ"],
  });
});

type OpenBody = {
  context: string;
  filters: { pattern?: string; horizon?: number; market?: string };
  exclude: string[];
  user_id: string;
};

// 문제 열기: 공개용 데이터 + 1회용 열람 토큰. 정답·이후 캔들은 절대 포함하지 않는다.
app.post("/puzzles/open", async (c) => {
  const body = await readJson<OpenBody>(c.req);
  const context = body.context ?? "practice";
  if (context !== "practice") return c.json({ error: "아직 준비 중인 모드예요." }, 400);

  const where = ["active = 1"];
  const args: (string | number)[] = [];
  const f = body.filters ?? {};
  if (f.pattern && config.patterns.some((p) => p.id === f.pattern)) { where.push("pattern = ?"); args.push(f.pattern); }
  if (f.horizon && String(f.horizon) in config.horizons) { where.push("horizon = ?"); args.push(Number(f.horizon)); }
  if (f.market === "KOSPI" || f.market === "KOSDAQ") { where.push("market = ?"); args.push(f.market); }
  const exclude = (Array.isArray(body.exclude) ? body.exclude : []).filter((x) => typeof x === "string").slice(-MAX_EXCLUDE);

  const pickOne = (ex: string[]) => {
    const w = [...where];
    if (ex.length) w.push(`id NOT IN (${ex.map(() => "?").join(",")})`);
    return c.env.DB.prepare(`SELECT id, payload FROM puzzles_public WHERE ${w.join(" AND ")} ORDER BY RANDOM() LIMIT 1`)
      .bind(...args, ...ex).first<{ id: string; payload: string }>();
  };
  const row = (await pickOne(exclude)) ?? (exclude.length ? await pickOne([]) : null);
  if (!row) return c.json({ error: "조건에 맞는 문제가 없어요." }, 404);

  const token = await makeToken(secret(c.env), row.id);
  const userId = typeof body.user_id === "string" ? body.user_id.slice(0, 64) : null;
  await c.env.DB.prepare("INSERT INTO opens (token, user_id, puzzle_id, context, opened_at) VALUES (?, ?, ?, ?, ?)")
    .bind(token, userId, row.id, context, Date.now()).run();

  return c.json({ ...JSON.parse(row.payload), open_token: token });
});

// 제출: 토큰 검증 → 사용 처리 → 판정 → 기록 → 정답·이후 캔들·해설·통계 응답
app.post("/puzzles/submit", async (c) => {
  const body = await readJson<{ open_token: string; pick: string; tags: unknown }>(c.req);
  const v = validateSubmit({ pick: String(body.pick ?? ""), tags: body.tags });
  if (typeof v === "string") return c.json({ error: v }, 400);
  const token = String(body.open_token ?? "");

  const open = await c.env.DB.prepare("SELECT puzzle_id, user_id, context, opened_at FROM opens WHERE token = ?")
    .bind(token).first<{ puzzle_id: string; user_id: string | null; context: string; opened_at: number }>();
  if (!open || !(await verifyToken(secret(c.env), token, open.puzzle_id)))
    return c.json({ error: "유효하지 않은 문제 토큰이에요." }, 403);

  // 1회용: used=0 인 경우에만 1로 바꾼다. 동시에 들어온 두 번째 제출은 changes=0 으로 걸러진다.
  const upd = await c.env.DB.prepare("UPDATE opens SET used = 1 WHERE token = ? AND used = 0").bind(token).run();
  if (!upd.meta.changes) return c.json({ error: "이미 제출한 문제예요." }, 409);

  const [pub, ans] = await Promise.all([
    c.env.DB.prepare("SELECT horizon FROM puzzles_public WHERE id = ?").bind(open.puzzle_id).first<{ horizon: number }>(),
    c.env.DB.prepare("SELECT payload FROM puzzles_answer WHERE id = ?").bind(open.puzzle_id).first<{ payload: string }>(),
  ]);
  if (!pub || !ans) return c.json({ error: "문제를 찾을 수 없어요." }, 404);
  const a = JSON.parse(ans.payload);
  const h = String(pub.horizon);
  const answer = a.answers[h] as Pick;
  const g = grade(v.pick, v.tags, answer, a.key_tags);
  const now = Date.now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO submissions (id, user_id, puzzle_id, context, pick, tags, correct, tag_hit, score, elapsed_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), open.user_id, open.puzzle_id, open.context, v.pick, JSON.stringify(v.tags),
      g.correct ? 1 : 0, g.tagHit ? 1 : 0, g.score, now - open.opened_at, now),
    c.env.DB.prepare("UPDATE puzzles_public SET play_count = play_count + 1 WHERE id = ?").bind(open.puzzle_id),
  ]);

  return c.json(await puzzleResult(c.env.DB, open.puzzle_id, g, v.pick, v.tags));
});

// 제출한 사람만: 이 문제의 전체 사용자 선택 비율
app.get("/puzzles/:id/distribution", async (c) => {
  const token = c.req.query("token") ?? "";
  const open = await c.env.DB.prepare("SELECT puzzle_id, used FROM opens WHERE token = ?")
    .bind(token).first<{ puzzle_id: string; used: number }>();
  if (!open || !open.used || open.puzzle_id !== c.req.param("id")) return c.json({ error: "제출 후에 볼 수 있어요." }, 403);
  return c.json(distribution(await pickCounts(c.env.DB, open.puzzle_id)));
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "서버 오류가 발생했어요." }, 500);
});

export default app;
