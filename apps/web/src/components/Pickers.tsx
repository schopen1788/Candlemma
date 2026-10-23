import type { Pick, Puzzle } from "../lib/api";
import { PICK_LABEL } from "../lib/api";

export const MAX_TAGS = 3;

export function TagPicker({ tags, value, onChange, disabled }: {
  tags: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (t: string) => {
    if (value.includes(t)) onChange(value.filter((x) => x !== t));
    else if (value.length < MAX_TAGS) onChange([...value, t]);
  };
  return (
    <section className="card">
      <div className="card-head">
        <h3>근거 고르기</h3>
        <span className="hint">{value.length}/{MAX_TAGS} · 1개 이상 필수</span>
      </div>
      <div className="chips" role="group" aria-label="근거 태그">
        {tags.map((t) => {
          const on = value.includes(t);
          return (
            <button
              key={t}
              type="button"
              className={`chip${on ? " on" : ""}`}
              aria-pressed={on}
              disabled={disabled || (!on && value.length >= MAX_TAGS)}
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function DirectionPicker({ puzzle, enabled, onPick, busy }: {
  puzzle: Puzzle;
  enabled: boolean;
  onPick: (p: Pick) => void;
  busy: boolean;
}) {
  const b = puzzle.flat_band.toFixed(1);
  return (
    <section className="card">
      <div className="card-head">
        <h3>T+{puzzle.horizon} 종가는?</h3>
        <span className="hint">{enabled ? "판단을 골라주세요" : "근거를 먼저 골라주세요"}</span>
      </div>
      <div className="dir">
        {(["up", "flat", "down"] as Pick[]).map((k) => (
          <button key={k} type="button" className={`dir-btn ${k}`} disabled={!enabled || busy} onClick={() => onPick(k)}>
            <strong>{PICK_LABEL[k]}</strong>
            <small>{k === "up" ? `+${b}% 초과` : k === "down" ? `−${b}% 미만` : `±${b}% 이내`}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function RuleCard({ puzzle }: { puzzle: Puzzle }) {
  return (
    <div className="rule">
      <span className="pill">{puzzle.market}</span>
      <span className="pill">{puzzle.sector}</span>
      <span className="rule-text">
        판정: 멈춘 날 종가 → <b>T+{puzzle.horizon}</b> 종가 · 보합 범위 <b>±{puzzle.flat_band.toFixed(1)}%</b>
      </span>
    </div>
  );
}

export function InfoCard({ puzzle }: { puzzle: Puzzle }) {
  const { themes, items } = puzzle.info;
  return (
    <section className="card info">
      <div className="card-head">
        <h3>공개 정보</h3>
        <span className="hint">멈춘 날까지 나온 정보만</span>
      </div>
      {themes.length > 0 && (
        <div className="chips static">{themes.map((t) => <span key={t} className="chip">#{t}</span>)}</div>
      )}
      {items.length > 0 ? (
        <ul className="news">
          {items.slice(0, 5).map((it, i) => (
            <li key={i}>
              <span className="d">D{it.d === 0 ? "-0" : it.d}</span>
              <span className="kind">{it.kind === "disclosure" ? "공시" : "뉴스"}</span>
              {it.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">이 문제는 등록된 공시·뉴스가 없어요. 차트와 거래대금만 보고 판단해요.</p>
      )}
    </section>
  );
}
