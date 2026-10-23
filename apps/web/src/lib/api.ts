export type Pick = "up" | "flat" | "down";

export interface Bar { d: number; o: number; h: number; l: number; c: number; tv: number }
export type MaSet = Record<string, (number | null)[]>;
export interface ReasonItem { id: string; label: string; description: string }
export interface ReasonGroup { id: string; name: string; description: string; items: ReasonItem[] }

export interface Puzzle {
  puzzle_id: string;
  mode_hint: string;
  market: string;
  sector: string;
  horizon: number;
  flat_band: number;
  judge_version?: string;
  bars: Bar[];
  ma: MaSet;
  tv_ma20: number[];
  replay_from: number;
  info: { themes: string[]; items: { d: number; kind: string; text: string; url: string | null }[] };
  tags: string[];
  open_token: string;
  reason_groups?: ReasonGroup[];
}

export interface SubmitResult {
  correct: boolean;
  tag_hit: boolean;
  score: number;
  pick: Pick | null;
  timed_out?: boolean;
  evidence?: { version: string; checks: (ReasonItem & { matched: boolean })[]; examples: ReasonItem[] };
  my_tags: string[];
  answer: Pick;
  change: number;
  horizon: number;
  flat_band: number;
  key_tags: string[];
  explain: string;
  disclosures: { d: number; date: string; title: string; url: string }[];
  pattern: { id: string; name: string; desc: string };
  stats: { n: number; up: number; flat: number; down: number } | null;
  distribution: { total: number; pct: Record<Pick, number> };
  reveal: { bars: Bar[]; ma: MaSet; tv_ma20: number[] };
  stock: { name: string; code: string; date: string; close_d0: number; dates: string[] };
}

export interface Meta {
  tags: string[];
  horizons: Record<string, number>;
  replay: { lookback: number; replay_days: number; ms_per_day: number; reveal_extra: number };
  patterns: { id: string; name: string; desc: string; count: number }[];
  markets: string[];
}

export interface Filters { pattern?: string; horizon?: number; market?: string }

const apiBase = /^\/candlemma(?:\/|$)/.test(location.pathname) ? "/candlemma/api" : "/api";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `요청 실패 (${res.status})`, res.status);
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export interface GameView {
  game: { id: string; state: "active" | "complete" | "expired"; score: number; correct_count: number;
    answered_count: number; total: number; accuracy: number; registered: boolean };
  rules: { season: string; horizon: number; question_ms: number; max_score: number };
  server_now: number;
  question: Puzzle & { ordinal: number; deadline: number };
  result: SubmitResult | null;
}
export interface RankingEntry {
  nickname: string; score: number; correct_count: number; registered_at: number;
  total: number; accuracy: number; rank: number; is_me?: boolean;
}
export interface RankingData { season: string; total: number; entries: RankingEntry[]; me: RankingEntry | null }
export const RANKING_SEASON = 'all-observations-flat05-v3';

export const api = {
  start: () => call<GameView>("/game/start", { method: "POST", body: JSON.stringify({ observation_version: 2 }) }),
  game: (id: string) => call<GameView>(`/game/${encodeURIComponent(id)}`),
  next: (id: string) => call<GameView>("/game/next", { method: "POST", body: JSON.stringify({ game_id: id }) }),
  answer: (id: string, question: string, pick: Pick | null, tags: string[]) =>
    call<GameView>("/game/answer", { method: "POST", body: JSON.stringify({ game_id: id, question_id: question, pick, tags }) }),
  ranking: () => call<RankingData>("/ranking"),
  myRanking: (season = RANKING_SEASON) => call<{ me: RankingEntry | null }>(`/ranking/me?season=${encodeURIComponent(season)}`),
  register: (id: string, nickname: string) => call<{ updated: boolean; me: RankingEntry }>("/ranking/submit", {
    method: "POST", body: JSON.stringify({ game_id: id, nickname }),
  }),
  meta: () => call<Meta>("/meta"),
  open: (filters: Filters, exclude: string[], userId: string) =>
    call<Puzzle>("/puzzles/open", {
      method: "POST",
      body: JSON.stringify({ context: "practice", observation_version: 2, filters, exclude, user_id: userId }),
    }),
  submit: (token: string, pick: Pick, tags: string[]) =>
    call<SubmitResult>("/puzzles/submit", {
      method: "POST",
      body: JSON.stringify({ open_token: token, pick, tags }),
    }),
};

export const PICK_LABEL: Record<Pick, string> = { up: "상승", flat: "보합", down: "하락" };
