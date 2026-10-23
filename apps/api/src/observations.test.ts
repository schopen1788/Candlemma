import { describe, expect, it } from 'vitest';
import { config } from './config';
import { observedReasons, observationFeedback, practiceGroups, type PracticeChart } from './observations';
import { grade, validateSubmit } from './grade';

type Candle = PracticeChart['bars'][number];
function chart(end: Partial<Candle> = {}): PracticeChart {
  return { bars: Array.from({ length: 120 }, (_, i) => ({ d: i - 119, o: 0, h: 1, l: -1, c: 0, tv: 100,
    ...(i === 119 ? end : {}) })), info: { items: [] } };
}
function candle(data: Partial<Candle>, d = 0): Candle {
  return { d, o: 0, h: 1, l: -1, c: 0, tv: 100, ...data };
}

describe('practice observation criteria', () => {
  it('publishes a unique explained catalog without marking correct observations', () => {
    const items = config.reason_groups.flatMap(g => g.items);
    expect(config.reason_groups).toHaveLength(9);
    expect(items).toHaveLength(44);
    expect(new Set(items.map(t => t.id)).size).toBe(items.length);
    expect(items.every(t => t.label && t.description)).toBe(true);
    const up = chart({ c: 10, h: 11 }), down = chart({ c: -10, l: -11 });
    expect(practiceGroups(up)).toEqual(practiceGroups(down));
    expect(practiceGroups(up).find(g => g.id === 'disclosure')!.items).toEqual([]);
  });

  it('finds support, resistance and range observations from the visible history', () => {
    expect(observedReasons(chart())).toEqual(expect.arrayContaining(['trend_narrow', 'support_bounce', 'support_repeated', 'resistance_repeated']));
    expect(observedReasons(chart({ c: -3, l: -4 }))).toContain('support_break');
    expect(observedReasons(chart({ c: 3, h: 4 }))).toContain('resistance_break');
    const fail = observedReasons(chart({ h: 4, c: 0 }));
    expect(fail).toContain('resistance_fail');
    expect(fail).not.toContain('resistance_break');
    const recovery = chart();
    recovery.bars[118] = candle({ c: -3, l: -4 }, -1);
    expect(observedReasons(recovery)).toContain('support_recover');
    const retest = chart({ l: 1, c: 2, h: 3 });
    retest.bars[118] = candle({ c: 3, h: 4 }, -1);
    expect(observedReasons(retest)).toContain('resistance_retest');
  });

  it('compares two ten-day windows for trend rather than using future price', () => {
    const up = chart();
    for (let i = 110; i < 120; i++) up.bars[i] = candle({ o: 5, h: 6, l: 4, c: 5 }, i - 119);
    expect(observedReasons(up)).toContain('trend_rising');
    const down = chart();
    for (let i = 110; i < 120; i++) down.bars[i] = candle({ o: -5, h: -4, l: -6, c: -5 }, i - 119);
    expect(observedReasons(down)).toContain('trend_falling');
    const converge = chart();
    for (let i = 100; i < 110; i++) converge.bars[i] = candle({ h: 10, l: -10 }, i - 119);
    expect(observedReasons(converge)).toContain('trend_converging');
  });

  it('distinguishes box breakout, breakdown and rejection', () => {
    expect(observedReasons(chart({ c: 3, h: 4 }))).toContain('box_break_up');
    expect(observedReasons(chart({ c: -3, l: -4 }))).toContain('box_break_down');
    expect(observedReasons(chart({ o: -.5, c: .5 }))).toContain('box_lower_bounce');
    expect(observedReasons(chart({ o: .5, c: -.5 }))).toContain('box_upper_reject');
    const wide = chart({ c: 3, h: 4 });
    wide.bars[100] = candle({ h: 40, l: -40 }, -19);
    expect(observedReasons(wide)).not.toContain('box_break_up');
  });

  it('uses displayed moving averages, compares crossings with the previous day', () => {
    const p = chart({ l: -1, c: 1 });
    p.ma = { '5': Array(120).fill(2), '20': Array(120).fill(0), '60': Array(120).fill(-2) };
    expect(observedReasons(p)).toEqual(expect.arrayContaining(['ma20_support', 'ma60_support', 'ma_bullish']));
    p.ma = { '5': Array(120).fill(-2), '20': Array(120).fill(0), '60': Array(120).fill(2) };
    expect(observedReasons(p)).toContain('ma_bearish');
    p.bars[118].c = -1;
    expect(observedReasons(p)).toContain('ma20_recover');
    p.bars[118].c = 1;
    p.bars[119].c = -1;
    expect(observedReasons(p)).toContain('ma20_break');
    expect(observedReasons(chart())).toContain('ma_cluster');
  });

  it('checks candle body and wick ratios, excludes zero-range candles', () => {
    expect(observedReasons(chart({ o: 0, c: 4, h: 5, l: -1 }))).toContain('candle_bull');
    expect(observedReasons(chart({ o: 0, c: -4, h: 1, l: -5 }))).toContain('candle_bear');
    expect(observedReasons(chart({ c: .2, h: 3 }))).toContain('candle_upper');
    expect(observedReasons(chart({ c: -.2, l: -3 }))).toContain('candle_lower');
    expect(observedReasons(chart())).toEqual(expect.arrayContaining(['candle_small', 'candle_small_run']));
    const zeroRange = observedReasons(chart({ o: 0, c: 0, h: 0, l: 0 }));
    for (const id of ['candle_small', 'candle_small_run', 'candle_upper', 'candle_lower']) expect(zeroRange).not.toContain(id);
  });

  it('distinguishes maintained and filled gaps', () => {
    expect(observedReasons(chart({ o: 3, l: 2, c: 4, h: 5 }))).toEqual(expect.arrayContaining(['gap_up', 'gap_up_hold']));
    const filled = observedReasons(chart({ o: 3, l: 0, c: 2, h: 4 }));
    expect(filled).toContain('gap_up_fill');
    expect(filled).not.toContain('gap_up_hold');
    expect(observedReasons(chart({ o: -3, l: -4, c: 0, h: 1 }))).toEqual(expect.arrayContaining(['gap_down', 'gap_down_recover']));
  });

  it('uses the preceding twenty days for turnover and does not treat zero data as a surge', () => {
    expect(observedReasons(chart({ c: 4, h: 5, tv: 250 }))).toEqual(expect.arrayContaining(['turnover_up_expand', 'turnover_breakout']));
    expect(observedReasons(chart({ c: 1, tv: 50 }))).toContain('turnover_up_dry');
    expect(observedReasons(chart({ c: -1, tv: 250 }))).toContain('turnover_down_expand');
    expect(observedReasons(chart({ c: -1, tv: 50 }))).toContain('turnover_down_dry');
    const p = chart({ c: -.5, tv: 50 });
    p.ma = { '20': Array(120).fill(-1) };
    expect(observedReasons(p)).toContain('turnover_pullback');
    p.bars.forEach(b => { b.tv = 0; });
    expect(observedReasons(p).filter(id => id.startsWith('turnover_'))).toEqual([]);
  });

  it('only reads visible information, never undisplayed or future disclosures', () => {
    const p = chart();
    p.info = { items: [{ d: -1, text: '실적 매출 사업보고서, 공급계약 체결, 자기주식 취득, 전환사채 발행' }] };
    expect(observedReasons(p)).toEqual(expect.arrayContaining(['disclosure_earnings', 'disclosure_contract', 'disclosure_buyback', 'disclosure_financing']));
    expect(practiceGroups(p).find(g => g.id === 'disclosure')!.items).toHaveLength(4);
    p.info = { items: [{ d: 1, text: '실적 사업보고서' }] };
    expect(observedReasons(p)).not.toContain('disclosure_earnings');
    p.info = { items: Array.from({ length: 6 }, (_, i) => ({ d: -1, text: i === 5 ? '실적' : '기타 공시' })) };
    expect(observedReasons(p)).not.toContain('disclosure_earnings');
  });

  it('ignores future bars and returns no observations without a stop candle', () => {
    const p = chart(), before = observedReasons(p);
    p.bars.push(candle({ c: 200, h: 300, tv: 100000 }, 1));
    expect(observedReasons(p)).toEqual(before);
    p.bars = p.bars.filter(b => b.d !== 0);
    expect(observedReasons(p)).toEqual([]);
  });

  it('keeps direction and observation feedback separate, legacy ranked validation unchanged', () => {
    const p = chart(), groups = practiceGroups(p), allowed = groups.flatMap(g => g.items.map(t => t.id));
    expect(validateSubmit({ pick: 'down', tags: ['candle_small'] })).toBeTypeOf('string');
    expect(validateSubmit({ pick: 'down', tags: ['candle_small'] }, allowed)).toEqual({ pick: 'down', tags: ['candle_small'] });
    const feedback = observationFeedback(p, ['candle_small', 'candle_bull']);
    expect(feedback.checks.map(c => c.matched)).toEqual([true, false]);
    expect(feedback.examples.length).toBeLessThanOrEqual(3);
    expect(grade('down', ['candle_small'], 'up', observedReasons(p))).toEqual({ correct: false, tagHit: true, score: 20 });
  });
});
