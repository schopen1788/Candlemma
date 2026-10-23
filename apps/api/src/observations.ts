import { config, type ReasonGroup } from './config';

export const OBSERVATION_CONTEXT = 'practice:observations-v2';
type Bar = { d: number; o: number; h: number; l: number; c: number; tv: number };
export type PracticeChart = {
  bars: Bar[];
  ma?: Record<string, (number | null)[]>;
  info?: { items?: { text: string; d: number }[] };
};

// The available catalog never depends on which chart observations are true.
// Only the presence of visible information controls whether its category is available.
export function practiceGroups(chart: PracticeChart): ReasonGroup[] {
  const hasInformation = chart.info?.items?.slice(0, 5).some(x => x.d <= 0 && x.text.trim());
  return config.reason_groups.map(g => g.id === 'disclosure' && !hasInformation ? { ...g, items: [] } : g);
}

/** Only candles/information visible at the stop are examined. No answer payload is accepted. */
export function observedReasons(chart: PracticeChart): string[] {
  const bars = chart.bars.filter(b => b.d <= 0 && [b.o, b.h, b.l, b.c, b.tv].every(Number.isFinite))
    .sort((a, b) => a.d - b.d).map(b => ({ ...b, o: b.o + 100, h: b.h + 100, l: b.l + 100, c: b.c + 100 }));
  const today = bars.at(-1), yesterday = bars.at(-2);
  if (!today || !yesterday || today.d !== 0) return [];
  const found = new Set<string>();
  const add = (id: string, condition: boolean) => { if (condition) found.add(id); };
  const high = (items: Bar[]) => Math.max(...items.map(b => b.h));
  const low = (items: Bar[]) => Math.min(...items.map(b => b.l));
  const near = (a: number, b: number, tolerance = .01) => b > 0 && Math.abs(a / b - 1) <= tolerance;
  const ma = (n: number, back = 0): number | null => {
    const candle = bars.at(-1 - back);
    if (!candle) return null;
    const originalIndex = chart.bars.findIndex(b => b.d === candle.d);
    const supplied = chart.ma?.[String(n)]?.[originalIndex];
    if (typeof supplied === 'number' && Number.isFinite(supplied)) return supplied + 100;
    const window = bars.slice(Math.max(0, bars.length - back - n), bars.length - back);
    return window.length === n ? window.reduce((sum, b) => sum + b.c, 0) / n : null;
  };
  const smallBody = (b: Bar, ratio: number) => b.h > b.l && Math.abs(b.c - b.o) <= (b.h - b.l) * ratio;

  if (bars.length >= 20) {
    const before = bars.slice(-20, -10), recent = bars.slice(-10);
    add('trend_rising', high(recent) > high(before) * 1.005 && low(recent) > low(before) * 1.005);
    add('trend_falling', high(recent) < high(before) * .995 && low(recent) < low(before) * .995);
    add('trend_converging', high(recent) < high(before) && low(recent) > low(before));
    add('trend_narrow', low(bars.slice(-20)) > 0 && high(bars.slice(-20)) / low(bars.slice(-20)) - 1 <= .08);
  }
  if (bars.length >= 21) {
    const prior = bars.slice(-21, -1), support = low(prior), resistance = high(prior);
    const bounce = near(today.l, support) && today.c > support;
    add('support_bounce', bounce);
    add('support_repeated', bounce && prior.filter(b => near(b.l, support)).length >= 2);
    add('support_break', today.c < support);
    add('resistance_break', today.c > resistance);
    add('resistance_repeated', near(today.h, resistance) && today.c < resistance && prior.filter(b => near(b.h, resistance)).length >= 2);
    add('resistance_fail', today.h > resistance && today.c < resistance);
    const avgTv = prior.reduce((sum, b) => sum + b.tv, 0) / 20;
    if (avgTv > 0) {
      const ratio = today.tv / avgTv;
      add('turnover_up_expand', today.c > yesterday.c && ratio >= 1.5);
      add('turnover_up_dry', today.c > yesterday.c && ratio < .7);
      add('turnover_down_expand', today.c < yesterday.c && ratio >= 1.5);
      add('turnover_down_dry', today.c < yesterday.c && ratio < .7);
      add('turnover_breakout', today.c > resistance && ratio >= 2);
      const line = ma(20);
      add('turnover_pullback', today.c < yesterday.c && line !== null && today.c >= line && ratio < .7);
    }
  }
  if (bars.length >= 22) {
    const older = bars.slice(-22, -2);
    add('support_recover', yesterday.c < low(older) && today.c >= low(older));
    add('resistance_retest', yesterday.c > high(older) && near(today.l, high(older)) && today.c >= high(older));
  }
  if (bars.length >= 41) {
    const prior = bars.slice(-41, -1), upper = high(prior), lower = low(prior);
    if (lower > 0 && upper / lower - 1 <= .15) {
      add('box_break_up', today.c > upper);
      add('box_break_down', today.c < lower);
      add('box_lower_bounce', near(today.l, lower) && today.c > today.o && today.c >= lower && today.c <= upper);
      add('box_upper_reject', near(today.h, upper) && today.c < today.o && today.c <= upper && today.c >= lower);
    }
  }
  const m5 = ma(5), m20 = ma(20), m60 = ma(60), prev20 = ma(20, 1);
  if (m20 !== null) {
    add('ma20_support', near(today.l, m20, .02) && today.c >= m20);
    add('ma20_break', prev20 !== null && yesterday.c >= prev20 && today.c < m20);
    add('ma20_recover', prev20 !== null && yesterday.c < prev20 && today.c >= m20);
  }
  if (m60 !== null) add('ma60_support', near(today.l, m60, .02) && today.c >= m60);
  if (m5 !== null && m20 !== null && m60 !== null) {
    add('ma_bullish', m5 > m20 && m20 > m60);
    add('ma_bearish', m5 < m20 && m20 < m60);
    add('ma_cluster', today.c > 0 && Math.max(m5, m20, m60) - Math.min(m5, m20, m60) <= today.c * .01);
  }
  const body = Math.abs(today.c - today.o), range = today.h - today.l;
  if (range > 0 && today.o > 0) {
    add('candle_bull', today.c / today.o - 1 >= .03 && body >= range * .6);
    add('candle_bear', today.c / today.o - 1 <= -.03 && body >= range * .6);
    const upper = today.h - Math.max(today.o, today.c), lower = Math.min(today.o, today.c) - today.l;
    add('candle_upper', upper >= body * 2 && upper >= range * .3);
    add('candle_lower', lower >= body * 2 && lower >= range * .3);
    add('candle_small', smallBody(today, .1));
  }
  add('candle_small_run', bars.length >= 3 && bars.slice(-3).every(b => smallBody(b, .25)));
  add('gap_up', today.o > yesterday.h);
  add('gap_down', today.o < yesterday.l);
  add('gap_up_hold', today.o > yesterday.h && today.l > yesterday.h);
  add('gap_up_fill', today.o > yesterday.h && today.l <= yesterday.h);
  add('gap_down_recover', today.o < yesterday.l && today.c >= yesterday.l);

  const text = (chart.info?.items ?? []).slice(0, 5).filter(x => x.d <= 0).map(x => x.text).join(' ');
  add('disclosure_earnings', /실적|매출|영업이익|사업보고서|감사보고서/.test(text));
  add('disclosure_contract', /판매.?공급계약|공급계약|계약.*(?:체결|해지)/.test(text));
  add('disclosure_buyback', /자사주|자기주식/.test(text));
  add('disclosure_financing', /증자|전환사채|신주인수권부사채/.test(text));
  return config.reason_groups.flatMap(g => g.items).filter(t => found.has(t.id)).map(t => t.id);
}

export function observationFeedback(chart: PracticeChart, selected: string[], verified = observedReasons(chart)) {
  const observed = new Set(verified);
  const catalog = config.reason_groups.flatMap(g => g.items);
  return {
    version: 'observations-v2',
    checks: selected.map(id => ({ ...catalog.find(t => t.id === id)!, matched: observed.has(id) })),
    examples: catalog.filter(t => observed.has(t.id) && !selected.includes(t.id)).slice(0, 3),
  };
}
