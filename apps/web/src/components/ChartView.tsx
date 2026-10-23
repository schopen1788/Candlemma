import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "../lib/api";

export const MA_KEYS = ["5", "20", "60"] as const;
const LOOKBACK = 119; // D-119 ~ D0
const DAY = 86400;
const BASE = 1577836800; // 시간축은 상대 거래일 → 가짜 타임스탬프로 매핑

const toTime = (d: number) => (BASE + (d + LOOKBACK) * DAY) as UTCTimestamp;
const toD = (t: Time) => Math.round(((t as number) - BASE) / DAY) - LOOKBACK;

export interface ChartViewProps {
  bars: Bar[];
  ma: Record<string, (number | null)[]>;
  tvMa20: (number | null)[];
  maOn: Record<string, boolean>;
  totalSlots: number;
  showStop: boolean;
  priceMode: "pct" | "krw";
  close0?: number;
  dates?: string[];
  dateMode: "rel" | "date";
  theme: "light" | "dark";
}

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(hex: string, a: number) {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((x) => x + x).join("") : m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default function ChartView(p: ChartViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const s = useRef<{
    candle: ISeriesApi<"Candlestick">;
    vol: ISeriesApi<"Histogram">;
    tvma: ISeriesApi<"Line">;
    ma: Record<string, ISeriesApi<"Line">>;
    markers: ISeriesMarkersPluginApi<Time>;
    stopLine: IPriceLine;
  } | null>(null);
  const fmt = useRef(p);
  fmt.current = p;

  // 차트 생성 (1회)
  useEffect(() => {
    const el = box.current!;
    const c = createChart(el, {
      autoSize: true,
      layout: { attributionLogo: false, background: { type: ColorType.Solid, color: "transparent" }, fontFamily: "inherit", fontSize: 11, panes: { separatorColor: "transparent" } },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.06 } },
      timeScale: {
        borderVisible: false,
        tickMarkFormatter: (t: Time) => label(toD(t), true),
      },
      localization: { timeFormatter: (t: Time) => label(toD(t), false) },
      handleScroll: false,
      handleScale: false,
    });
    const pricePct = { type: "custom" as const, minMove: 0.01, formatter: (v: number) => price(v) };
    const candle = c.addSeries(CandlestickSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: pricePct });
    const ma: Record<string, ISeriesApi<"Line">> = {};
    for (const k of MA_KEYS) {
      ma[k] = c.addSeries(LineSeries, { priceFormat: pricePct, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    }
    const vol = c.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}억` } }, 1);
    const tvma = c.addSeries(LineSeries, { lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}억` } }, 1);
    const panes = c.panes();
    panes[0].setStretchFactor(0.7);
    panes[1].setStretchFactor(0.3);
    const markers = createSeriesMarkers(candle, []);
    chart.current = c;
    const stopLine = candle.createPriceLine({ price: 0, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, lineVisible: false, title: "" });
    s.current = { candle, vol, tvma, ma, markers, stopLine };
    return () => {
      c.remove();
      chart.current = null;
      s.current = null;
    };
  }, []);

  function label(d: number, short: boolean) {
    const { dateMode, dates } = fmt.current;
    if (dateMode === "date" && dates?.[d + LOOKBACK]) {
      const v = dates[d + LOOKBACK];
      return short ? v.slice(2).replace(/-/g, ".") : v;
    }
    return d === 0 ? "D-0" : d < 0 ? `D${d}` : `D+${d}`;
  }

  function price(v: number) {
    const { priceMode, close0 } = fmt.current;
    if (priceMode === "krw" && close0) return `${Math.round(close0 * (1 + v / 100)).toLocaleString("ko-KR")}원`;
    return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  }

  // 테마·표시 모드
  useEffect(() => {
    const c = chart.current, ss = s.current;
    if (!c || !ss) return;
    const text = css("--muted"), grid = css("--grid"), up = css("--up"), down = css("--down");
    c.applyOptions({
      layout: { textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { vertLine: { labelBackgroundColor: css("--ink-2") }, horzLine: { labelBackgroundColor: css("--ink-2") } },
      localization: { timeFormatter: (t: Time) => label(toD(t), false) },
      timeScale: { tickMarkFormatter: (t: Time) => label(toD(t), true) },
    });
    ss.candle.applyOptions({ priceFormat: { type: "custom", minMove: 0.01, formatter: price }, upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    ss.ma["5"].applyOptions({ color: css("--ma5") });
    ss.ma["20"].applyOptions({ color: css("--ma20") });
    ss.ma["60"].applyOptions({ color: css("--ma60") });
    ss.tvma.applyOptions({ color: css("--muted") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.theme, p.priceMode, p.dateMode, p.close0, p.dates]);

  // 데이터
  useEffect(() => {
    const c = chart.current, ss = s.current;
    if (!c || !ss) return;
    const up = css("--up"), down = css("--down");
    ss.candle.setData(p.bars.map((b) => ({ time: toTime(b.d), open: b.o, high: b.h, low: b.l, close: b.c })));
    ss.vol.setData(p.bars.map((b) => ({ time: toTime(b.d), value: b.tv, color: withAlpha(b.c >= b.o ? up : down, b.d > 0 ? 0.75 : 0.45) })));
    const line = (arr: (number | null)[]) =>
      p.bars.flatMap((b, i) => (arr[i] == null ? [] : [{ time: toTime(b.d), value: arr[i] as number }]));
    ss.tvma.setData(line(p.tvMa20));
    for (const k of MA_KEYS) {
      ss.ma[k].setData(line(p.ma[k] ?? []));
      ss.ma[k].applyOptions({ visible: !!p.maOn[k] });
    }
    ss.markers.setMarkers(
      p.showStop && p.bars.some((b) => b.d === 0)
        ? [{ time: toTime(0), position: "aboveBar", shape: "arrowDown", color: css("--accent"), text: "멈춤" }]
        : [],
    );
    const stop = p.showStop && p.bars.some((b) => b.d === 0);
    ss.stopLine.applyOptions({ lineVisible: stop, axisLabelVisible: stop, color: css("--accent") });
    c.timeScale().setVisibleLogicalRange({ from: -0.5, to: p.totalSlots + 0.5 });
  }, [p.bars, p.ma, p.tvMa20, p.maOn, p.totalSlots, p.showStop, p.theme]);

  return <div className="chart" ref={box} />;
}
