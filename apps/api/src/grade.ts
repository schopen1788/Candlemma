import { config, PICKS, type Pick } from "./config";

export const SCORE_CORRECT = 100;
export const SCORE_TAG_HIT = 20;

export interface SubmitInput { pick: string; tags: unknown }

/** 입력 검증. 근거 태그 1~3개, 중복 없음, 설정된 태그만. */
export function validateSubmit(input: SubmitInput): { pick: Pick; tags: string[] } | string {
  if (!PICKS.includes(input.pick as Pick)) return "예측 방향이 올바르지 않아요.";
  if (!Array.isArray(input.tags)) return "근거 태그를 골라주세요.";
  const tags = [...new Set(input.tags.map(String))];
  if (tags.length < 1 || tags.length > 3) return "근거 태그는 1~3개를 골라주세요.";
  if (tags.some((t) => !config.tags.includes(t))) return "알 수 없는 근거 태그예요.";
  return { pick: input.pick as Pick, tags };
}

export function grade(pick: Pick, tags: string[], answer: Pick, keyTags: string[]) {
  const correct = pick === answer;
  const tagHit = tags.some((t) => keyTags.includes(t));
  return { correct, tagHit, score: (correct ? SCORE_CORRECT : 0) + (tagHit ? SCORE_TAG_HIT : 0) };
}

/** 선택 비율(%). 합이 100이 되도록 최대 잔여 방식으로 반올림. */
export function distribution(counts: Partial<Record<Pick, number>>) {
  const total = PICKS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const pct: Record<Pick, number> = { up: 0, flat: 0, down: 0 };
  if (!total) return { total, pct };
  const raw = PICKS.map((k) => ((counts[k] ?? 0) * 100) / total);
  const floor = raw.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - floor[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) if (rest-- > 0) floor[i]++;
  PICKS.forEach((k, i) => (pct[k] = floor[i]));
  return { total, pct };
}
