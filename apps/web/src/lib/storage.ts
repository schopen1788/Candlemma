// 브라우저 저장소: 기기 id, 최근 푼 문제, 복기 노트, 테마. 모두 실패해도 동작해야 한다.
import type { Pick } from "./api";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경 */
  }
}

export function deviceId(): string {
  let id = read<string>("cm.device", "");
  if (!id) {
    id = crypto.randomUUID();
    write("cm.device", id);
  }
  return id;
}

const SEEN_MAX = 80;
export const seen = {
  list: () => read<string[]>("cm.seen", []),
  add: (id: string) => write("cm.seen", [...seen.list().filter((x) => x !== id), id].slice(-SEEN_MAX)),
};

export interface Note {
  id: string;
  puzzle_id: string;
  created_at: number;
  name: string;
  code: string;
  date: string;
  pattern: string;
  horizon: number;
  pick: Pick | null;
  answer: Pick;
  change: number;
  my_tags: string[];
  key_tags: string[];
  text: string;
}

export const notes = {
  list: () => read<Note[]>("cm.notes", []),
  add: (n: Note) => write("cm.notes", [n, ...notes.list().filter((x) => x.puzzle_id !== n.puzzle_id)].slice(0, 200)),
  remove: (id: string) => write("cm.notes", notes.list().filter((x) => x.id !== id)),
};

export type ThemePref = "system" | "light" | "dark";
export const themePref = {
  get: () => read<ThemePref>("cm.theme", "system"),
  set: (t: ThemePref) => write("cm.theme", t),
};

export const prefs = {
  ma: () => read<Record<string, boolean>>("cm.ma", { "5": false, "20": true, "60": true }),
  setMa: (v: Record<string, boolean>) => write("cm.ma", v),
  filters: () => read<{ pattern?: string; horizon?: number; market?: string }>("cm.filters", {}),
  setFilters: (v: object) => write("cm.filters", v),
};

// Convenience for refresh recovery only. The server cookie remains the identity.
export const rankedGame = {
  get: () => read<string>("cm.rankedGame", ""),
  set: (id: string) => write("cm.rankedGame", id),
};
