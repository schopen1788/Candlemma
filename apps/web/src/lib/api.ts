export type Pick = "up" | "flat" | "down";

export interface Bar { d: number; o: number; h: number; l: number; c: number; tv: number }
export type MaSet = Record<string, (number | null)[]>;

export interface Puzzle {
  puzzle_id: string;
  mode_hint: string;
  market: string;
  sector: string;
  horizon: number;
  flat_band: number;
  bars: Bar[];
  ma: MaSet;
  tv_ma20: number[];
  replay_from: number;
  info: { themes: string[]; items: { d: number; kind: string; text: string; url: string | null }[] };
  tags: string[];
  open_token: string;
}

export interface SubmitResult {
  correct: boolean;
  tag_hit: boolean;
  score: number;
  pick: Pick;
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export const api = {
  meta: () => call<Meta>("/meta"),
  open: (filters: Filters, exclude: string[], userId: string) =>
    call<Puzzle>("/puzzles/open", {
      method: "POST",
      body: JSON.stringify({ context: "practice", filters, exclude, user_id: userId }),
    }),
  submit: (token: string, pick: Pick, tags: string[]) =>
    call<SubmitResult>("/puzzles/submit", {
      method: "POST",
      body: JSON.stringify({ open_token: token, pick, tags }),
    }),
};

export const PICK_LABEL: Record<Pick, string> = { up: "상승", flat: "보합", down: "하락" };
