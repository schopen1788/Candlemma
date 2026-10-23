import { describe, expect, it } from "vitest";
import { distribution, grade, validateSubmit } from "./grade";
import { makeToken, verifyToken } from "./token";
import { config } from "./config";

describe("grade", () => {
  it("방향 정답 100 + 근거 일치 20", () => {
    expect(grade("up", ["신고가 돌파"], "up", ["신고가 돌파", "거래대금 급증"])).toEqual({ correct: true, tagHit: true, score: 120 });
    expect(grade("down", ["긴 윗꼬리"], "up", ["신고가 돌파"])).toEqual({ correct: false, tagHit: false, score: 0 });
    expect(grade("flat", ["거래대금 감소"], "up", ["거래대금 감소"]).score).toBe(20);
  });
});

describe("validateSubmit", () => {
  const t = config.tags;
  it("태그 1~3개만 허용", () => {
    expect(validateSubmit({ pick: "up", tags: [] })).toBeTypeOf("string");
    expect(validateSubmit({ pick: "up", tags: t.slice(0, 4) })).toBeTypeOf("string");
    expect(validateSubmit({ pick: "up", tags: [t[0], t[0]] })).toEqual({ pick: "up", tags: [t[0]] });
  });
  it("알 수 없는 방향·태그 거부", () => {
    expect(validateSubmit({ pick: "moon", tags: [t[0]] })).toBeTypeOf("string");
    expect(validateSubmit({ pick: "up", tags: ["없는 태그"] })).toBeTypeOf("string");
  });
});

describe("distribution", () => {
  it("합이 100", () => {
    const d = distribution({ up: 1, flat: 1, down: 1 });
    expect(d.pct.up + d.pct.flat + d.pct.down).toBe(100);
    expect(d.total).toBe(3);
    expect(distribution({}).total).toBe(0);
  });
});

describe("token", () => {
  it("서명 검증, 다른 문제 id 로는 실패", async () => {
    const tok = await makeToken("s", "pz_a");
    expect(await verifyToken("s", tok, "pz_a")).toBe(true);
    expect(await verifyToken("s", tok, "pz_b")).toBe(false);
    expect(await verifyToken("other", tok, "pz_a")).toBe(false);
    expect(await verifyToken("s", "garbage", "pz_a")).toBe(false);
  });
});
