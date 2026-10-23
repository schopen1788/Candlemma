import { useId, useState } from "react";
import type { Pick, Puzzle, ReasonGroup } from "../lib/api";
import { PICK_LABEL } from "../lib/api";
import { directionRanges } from "../lib/judging";

export const MAX_TAGS = 3;

export function TagPicker({ tags, value, onChange, disabled, groups }: {
  tags: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  groups?: ReasonGroup[];
}) {
  const [active, setActive] = useState(groups?.[0]?.id ?? "trend");
  const panelId = useId();
  const toggle = (t: string) => {
    if (value.includes(t)) onChange(value.filter((x) => x !== t));
    else if (value.length < MAX_TAGS) onChange([...value, t]);
  };
  if (groups?.length) {
    const selectedGroup = groups.find(g => g.id === active) ?? groups[0];
    const catalog = groups.flatMap(g => g.items);
    return <section className="card observation-picker">
      <div className="card-head"><h3>1. 차트에서 관찰한 사실</h3><span className="hint" role="status">{value.length}/{MAX_TAGS} 선택</span></div>
      <p className="observation-intro">분류를 펼쳐 핵심 관찰을 1~3개 골라주세요. 각 항목 아래에서 확인 기준을 볼 수 있어요.</p>
      {value.length > 0 && <div className="chips chosen-reasons" role="group" aria-label="선택한 관찰">
        {value.map(id => <button key={id} type="button" className="chip on" onClick={() => toggle(id)} disabled={disabled}
          aria-label={`${catalog.find(t => t.id === id)?.label ?? id} 선택 해제`}>
          {catalog.find(t => t.id === id)?.label ?? id}<span aria-hidden>×</span>
        </button>)}
      </div>}
      <div className="reason-categories" role="group" aria-label="관찰 분류">
        {groups.map(g => {
          const count = g.items.filter(t => value.includes(t.id)).length;
          return <button key={g.id} type="button" className={`reason-category${selectedGroup.id === g.id ? " active" : ""}`}
            aria-expanded={selectedGroup.id === g.id} aria-controls={panelId} onClick={() => setActive(g.id)}>
            {g.name}{count > 0 && <span aria-label={`${count}개 선택`}>{count}</span>}
          </button>;
        })}
      </div>
      <div id={panelId} className="reason-panel" role="group" aria-label={`${selectedGroup.name} 세부 근거`}>
        <p className="reason-group-help">{selectedGroup.description}</p>
        {selectedGroup.items.length === 0 ? <p className="muted small">이 문제에는 공개된 공시·뉴스가 없어요. 다른 분류에서 차트 근거를 골라주세요.</p>
          : <div className="reason-options">{selectedGroup.items.filter(t => tags.includes(t.id)).map(t => {
            const on = value.includes(t.id);
            return <button key={t.id} type="button" className={`reason-option${on ? " selected" : ""}`} aria-pressed={on}
              disabled={disabled || (!on && value.length >= MAX_TAGS)} onClick={() => toggle(t.id)}>
              <span className="reason-option-copy"><strong>{t.label}</strong><small>{t.description}</small></span>
              <span className="reason-check" aria-hidden>{on ? "✓" : "+"}</span>
            </button>;
          })}</div>}
      </div>
      {value.length >= MAX_TAGS && <p className="hint">3개를 모두 골랐어요. 선택한 관찰을 해제하면 바꿀 수 있어요.</p>}
    </section>;
  }
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
  const ranges = directionRanges(puzzle.flat_band);
  return (
    <section className="card">
      <div className="card-head">
        <h3>{puzzle.reason_groups ? "2. " : ""}T+{puzzle.horizon} 종가는?</h3>
        <span className="hint">{enabled ? "판단을 골라주세요" : "근거를 먼저 골라주세요"}</span>
      </div>
      {puzzle.reason_groups && <p className="observation-intro">관찰한 사실을 바탕으로 이후 방향을 판단해 보세요.</p>}
      <div className="dir">
        {(["up", "flat", "down"] as Pick[]).map((k) => (
          <button key={k} type="button" className={`dir-btn ${k}`} disabled={!enabled || busy} onClick={() => onPick(k)}>
            <strong>{PICK_LABEL[k]}</strong>
            <small>{ranges[k]}</small>
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
        판정: 멈춘 날 종가 → <b>T+{puzzle.horizon}</b> 종가 · 보합 <b>{directionRanges(puzzle.flat_band).flat}</b>
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
