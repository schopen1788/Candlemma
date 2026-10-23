import cfg from "./generated/config.json";

export type Pick = "up" | "flat" | "down";
export type ReasonItem = { id: string; label: string; description: string };
export type ReasonGroup = { id: string; name: string; description: string; items: ReasonItem[] };
export const config = cfg as {
  judge_version: string;
  tags: string[];
  reason_groups: ReasonGroup[];
  horizons: Record<string, number>;
  replay: { lookback: number; replay_days: number; ms_per_day: number; reveal_extra: number };
  patterns: { id: string; num: number; name: string; desc: string; key_tags: string[] }[];
};
export const PICKS: Pick[] = ["up", "flat", "down"];
