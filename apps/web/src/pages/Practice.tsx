import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartView, { MA_KEYS } from "../components/ChartView";
import { DirectionPicker, InfoCard, RuleCard, TagPicker } from "../components/Pickers";
import ResultPanel from "../components/ResultPanel";
import { api, type Bar, type Filters, type Meta, type Pick, type Puzzle, type SubmitResult } from "../lib/api";
import { deviceId, notes, prefs, seen } from "../lib/storage";

type Phase = "loading" | "replay" | "decide" | "submitting" | "reveal" | "result" | "error";
const REVEAL_TOTAL_MS = 2000;
const isNarrow = () => window.matchMedia?.("(max-width: 640px)").matches ?? false;

export default function Practice({ meta, filters, theme, onHome }: {
  meta: Meta | null;
  filters: Filters;
  theme: "light" | "dark";
  onHome: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [shown, setShown] = useState(0); // 보이는 과거 봉 수
  const [revealed, setRevealed] = useState(0); // 공개된 이후 봉 수
  const [tags, setTags] = useState<string[]>([]);
  const [res, setRes] = useState<SubmitResult | null>(null);
  const [maOn, setMaOn] = useState(prefs.ma());
  const [priceMode, setPriceMode] = useState<"pct" | "krw">("pct");
  const [dateMode, setDateMode] = useState<"rel" | "date">("rel");
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState<"near" | "all">(isNarrow() ? "near" : "all");
  const [session, setSession] = useState({ n: 0, correct: 0, hit: 0 });
  const timer = useRef<number | undefined>(undefined);
  const top = useRef<HTMLDivElement>(null);

  const replay = meta?.replay ?? { lookback: 120, replay_days: 40, ms_per_day: 120, reveal_extra: 10 };

  const load = useCallback(async () => {
    window.clearInterval(timer.current);
    setPhase("loading");
    setRes(null);
    setTags([]);
    setRevealed(0);
    setSaved(false);
    setPriceMode("pct");
    setDateMode("rel");
    try {
      const p = await api.open(filters, seen.list(), deviceId());
      seen.add(p.puzzle_id);
      setPz(p);
      setShown(p.bars.filter((b) => b.d < p.replay_from).length);
      setPhase("replay");
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [filters]);

  useEffect(() => {
    load();
    return () => window.clearInterval(timer.current);
  }, [load]);

  // 리플레이: 하루씩
  useEffect(() => {
    if (phase !== "replay" || !pz) return;
    timer.current = window.setInterval(() => {
      setShown((n) => {
        if (n + 1 >= pz.bars.length) {
          window.clearInterval(timer.current);
          setPhase("decide");
          return pz.bars.length;
        }
        return n + 1;
      });
    }, replay.ms_per_day);
    return () => window.clearInterval(timer.current);
  }, [phase, pz, replay.ms_per_day]);

  // 공개 재생: 이후 봉을 약 2초에 걸쳐
  useEffect(() => {
    if (phase !== "reveal" || !res) return;
    const total = res.reveal.bars.length;
    const step = Math.max(40, Math.round(REVEAL_TOTAL_MS / Math.max(1, total)));
    timer.current = window.setInterval(() => {
      setRevealed((n) => {
        if (n + 1 >= total) {
          window.clearInterval(timer.current);
          setPhase("result");
          return total;
        }
        return n + 1;
      });
    }, step);
    return () => window.clearInterval(timer.current);
  }, [phase, res]);

  const skip = () => {
    if (!pz) return;
    window.clearInterval(timer.current);
    if (phase === "replay") {
      setShown(pz.bars.length);
      setPhase("decide");
    } else if (phase === "reveal" && res) {
      setRevealed(res.reveal.bars.length);
      setPhase("result");
    }
  };

  const submit = async (pick: Pick) => {
    if (!pz || tags.length === 0) return;
    setPhase("submitting");
    try {
      const r = await api.submit(pz.open_token, pick, tags);
      setRes(r);
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSession((s) => ({ n: s.n + 1, correct: s.correct + (r.correct ? 1 : 0), hit: s.hit + (r.tag_hit ? 1 : 0) }));
      setPhase("reveal");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const toggleMa = (k: string) => {
    const v = { ...maOn, [k]: !maOn[k] };
    setMaOn(v);
    prefs.setMa(v);
  };

  const saveNote = (text: string) => {
    if (!res || !pz) return;
    notes.add({
      id: crypto.randomUUID(),
      puzzle_id: pz.puzzle_id,
      created_at: Date.now(),
      name: res.stock.name,
      code: res.stock.code,
      date: res.stock.date,
      pattern: res.pattern.name,
      horizon: res.horizon,
      pick: res.pick,
      answer: res.answer,
      change: res.change,
      my_tags: res.my_tags,
      key_tags: res.key_tags,
      text,
    });
    setSaved(true);
  };

  // 차트 데이터: 과거(shown) + 공개된 이후 봉
  const chartData = useMemo(() => {
    if (!pz) return null;
    const past = pz.bars.slice(0, shown);
    const fut: Bar[] = res ? res.reveal.bars.slice(0, revealed) : [];
    const ma: Record<string, (number | null)[]> = {};
    for (const k of MA_KEYS) ma[k] = [...(pz.ma[k] ?? []).slice(0, shown), ...(res?.reveal.ma[k] ?? []).slice(0, revealed)];
    return {
      bars: [...past, ...fut],
      ma,
      tvMa20: [...pz.tv_ma20.slice(0, shown), ...(res?.reveal.tv_ma20 ?? []).slice(0, revealed)],
    };
  }, [pz, shown, res, revealed]);

  const totalSlots = pz ? pz.bars.length + pz.horizon + replay.reveal_extra : 0;
  const stopped = phase !== "loading" && phase !== "replay";

  return (
    <div className="practice" ref={top}>
      <div className="practice-top">
        <button type="button" className="link" onClick={onHome}>← 처음으로</button>
        {session.n > 0 && (
          <span className="session">이번 연습 · 정확도 {session.correct}/{session.n} · 근거 일치 {session.hit}/{session.n}</span>
        )}
      </div>

      {phase === "error" && (
        <div className="card error">
          <p>{error}</p>
          <button type="button" className="btn primary" onClick={load}>다시 시도</button>
        </div>
      )}

      {pz && chartData && phase !== "error" && (
        <>
          <RuleCard puzzle={pz} />
          <div className="chart-wrap">
            <div className="chart-bar">
              <div className="ma-toggles" role="group" aria-label="이동평균선">
                {MA_KEYS.map((k) => (
                  <button key={k} type="button" className={`ma-t ma${k}${maOn[k] ? " on" : ""}`} aria-pressed={!!maOn[k]} onClick={() => toggleMa(k)}>
                    <i />{k}일
                  </button>
                ))}
                <span className="tv-legend"><i />거래대금 20일 평균</span>
              </div>
              <button type="button" className="btn small ghost" onClick={() => setZoom(zoom === "near" ? "all" : "near")}>
                {zoom === "near" ? "전체 보기" : "확대 보기"}
              </button>
              {(phase === "replay" || phase === "reveal") && (
                <button type="button" className="btn small ghost" onClick={skip}>건너뛰기 ⏭</button>
              )}
              {phase === "loading" && <span className="hint">불러오는 중…</span>}
            </div>
            <ChartView
              bars={chartData.bars}
              ma={chartData.ma}
              tvMa20={chartData.tvMa20}
              maOn={maOn}
              totalSlots={totalSlots}
              showStop={stopped}
              priceMode={priceMode}
              close0={res?.stock.close_d0}
              dates={res?.stock.dates}
              dateMode={dateMode}
              theme={theme}
              zoom={zoom}
              revealing={!!res}
            />
            {zoom === "near" && <p className="axis-note">← 옆으로 밀면 이전 구간, 두 손가락으로 확대·축소</p>}
            <p className="axis-note">가격: {priceMode === "krw" ? "원화 (수정주가)" : "멈춘 날 종가 대비 %"} · 아래: 거래대금(억 원, 추정)</p>
          </div>

          {(phase === "decide" || phase === "submitting") && (
            <div className="decide">
              <InfoCard puzzle={pz} />
              <TagPicker tags={pz.tags} value={tags} onChange={setTags} disabled={phase === "submitting"} />
              <DirectionPicker puzzle={pz} enabled={tags.length > 0} busy={phase === "submitting"} onPick={submit} />
            </div>
          )}

          {phase === "replay" && <p className="muted center">차트가 하루씩 재생되고 있어요. 멈추면 판단할 차례예요.</p>}
          {phase === "reveal" && <p className="muted center">이후 흐름을 공개하는 중…</p>}

          {phase === "result" && res && (
            <ResultPanel
              r={res}
              onNext={load}
              onSaveNote={saveNote}
              saved={saved}
              priceMode={priceMode}
              setPriceMode={setPriceMode}
              dateMode={dateMode}
              setDateMode={setDateMode}
            />
          )}
        </>
      )}
    </div>
  );
}
