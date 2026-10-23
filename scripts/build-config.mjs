// config/*.yaml → apps/api/src/generated/config.json (API 가 프론트에 내려줄 설정)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse } from "yaml";

const read = (n) => parse(readFileSync(new URL(`../config/${n}`, import.meta.url), "utf8"));
const judge = read("judge.yaml");
const tags = read("tags.yaml");
const patterns = read("patterns.yaml");
const reasons = read("reasons.yaml");
const reasonIds = reasons.groups.flatMap(g => g.items.map(t => t.id));
if (new Set(reasonIds).size !== reasonIds.length) throw new Error("Duplicate observation ID");

const out = {
  judge_version: judge.version,
  tags: tags.tags,
  reason_groups: reasons.groups,
  horizons: Object.fromEntries(Object.entries(judge.horizons).map(([k, v]) => [k, Number(v)])),
  replay: judge.replay,
  patterns: Object.entries(patterns.patterns)
    .sort((a, b) => a[1].num - b[1].num)
    .map(([id, p]) => ({ id, num: p.num, name: p.name, desc: p.desc, key_tags: p.key_tags })),
};
const dir = new URL("../apps/api/src/generated/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("config.json", dir), JSON.stringify(out, null, 2));
console.log("config.json written");
