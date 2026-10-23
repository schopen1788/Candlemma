import { useState } from "react";
import type { Pick, SubmitResult } from "../lib/api";
import { PICK_LABEL } from "../lib/api";
import { directionRanges } from "../lib/judging";

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function ResultPanel({ r, onNext, onSaveNote, saved, priceMode, setPriceMode, dateMode, setDateMode, nextLabel = "다음 문제" }: {
  r: SubmitResult;
  onNext: () => void;
  nextLabel?: string;
  onSaveNote: (text: string) => void;
  saved: boolean;
  priceMode: "pct" | "krw";
  setPriceMode: (m: "pct" | "krw") => void;
  dateMode: "rel" | "date";
  setDateMode: (m: "rel" | "date") => void;
}) {
  const [memo, setMemo] = useState("");
  const all = [...new Set([...r.my_tags, ...r.key_tags])];
  return (
    <section className="result">
      <div className={`verdict ${r.correct ? "ok" : "miss"}`}>
        <div>
          <p className="verdict-title">{r.timed_out ? "시간이 끝났어요" : r.correct ? "맞았어요" : "아쉬워요"}</p>
          <p className="verdict-sub">
            정답 <b className={r.answer}>{PICK_LABEL[r.answer]}</b> · 내 판단 {r.pick ? PICK_LABEL[r.pick] : "시간 초과"}
          </p>
          {r.evidence && <p className="hint">방향 {r.correct ? 100 : 0}점 · 관찰 {r.tag_hit ? 20 : 0}점 · 합계 {r.score}점</p>}
        </div>
        <div className="verdict-num">
          <span className={r.change > 0 ? "up" : r.change < 0 ? "down" : ""}>{pct(r.change)}</span>
          <small>T+{r.horizon} 종가 변동 · 보합 {directionRanges(r.flat_band).flat}</small>
        </div>
      </div>

      {r.evidence ? <section className="card observation-feedback">
        <div className="card-head"><h3>내 관찰 확인</h3><span className={`badge ${r.tag_hit ? "ok" : ""}`}>
          {r.evidence.checks.filter(t => t.matched).length}/{r.evidence.checks.length} 일치
        </span></div>
        <p className="observation-intro">멈춘 날까지의 차트와 공개 정보로 확인했어요. 관찰 일치와 이후 가격 방향은 별도로 평가해요.</p>
        <ul className="observation-checks">{r.evidence.checks.map(t => <li key={t.id}>
          <div><strong>{t.label}</strong><span className={`badge ${t.matched ? "ok" : ""}`}>{t.matched ? "관찰 일치" : "기준과 다름"}</span></div>
          <p>{t.description}</p>
        </li>)}</ul>
        {r.evidence.examples.length > 0 && <details className="observation-examples"><summary>함께 살펴볼 관찰 {r.evidence.examples.length}개</summary>
          <ul>{r.evidence.examples.map(t => <li key={t.id}><strong>{t.label}</strong><p>{t.description}</p></li>)}</ul>
        </details>}
        <p className="hint">선택한 관찰이 하나 이상 일치하면 관찰 점수 20점을 받아요.</p>
      </section> : <div className="card">
        <div className="card-head">
          <h3>내 근거 vs 핵심 근거</h3>
          <span className={`badge ${r.tag_hit ? "ok" : ""}`}>{r.tag_hit ? "근거 일치" : "근거 불일치"}</span>
        </div>
        <div className="chips static">
          {all.map((t) => {
            const mine = r.my_tags.includes(t), key = r.key_tags.includes(t);
            return (
              <span key={t} className={`chip ${mine && key ? "hit" : key ? "key" : "mine"}`}>
                {t}
                <em>{mine && key ? "일치" : key ? "핵심" : "내 선택"}</em>
              </span>
            );
          })}
        </div>
      </div>}

      <div className="card">
        <div className="card-head">
          <h3>해설</h3>
          <span className="pill">{r.pattern.name}</span>
        </div>
        <p className="explain">{r.explain}</p>
        {r.stats && (
          <div className="stat">
            <p className="small">
              이 패턴은 2020~2025년에 <b>{r.stats.n.toLocaleString("ko-KR")}번</b> 나왔고, T+{r.horizon} 기준
            </p>
            <Dist pct={{ up: r.stats.up, flat: r.stats.flat, down: r.stats.down }} />
            <p className="muted tiny">출제용 균형 샘플이 아닌 전체 원본 분포예요.</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>다른 사람들의 판단</h3>
          <span className="hint">{r.distribution.total.toLocaleString("ko-KR")}명 제출</span>
        </div>
        <Dist pct={r.distribution.pct} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>종목 공개</h3>
        </div>
        <p className="stock">
          <b>{r.stock.name}</b> <span className="muted">{r.stock.code}</span>
        </p>
        <p className="small">
          멈춘 날 {r.stock.date} · 종가 {r.stock.close_d0.toLocaleString("ko-KR")}원
        </p>
        {(r.disclosures ?? []).length > 0 && (
          <ul className="news disc">
            {r.disclosures.map((x) => (
              <li key={x.url}>
                <span className="d">{x.date.slice(5).replace("-", ".")}</span>
                <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a>
              </li>
            ))}
          </ul>
        )}
        <div className="toggles">
          <button type="button" className={`seg${priceMode === "krw" ? " on" : ""}`} onClick={() => setPriceMode(priceMode === "krw" ? "pct" : "krw")}>
            원화 가격으로 보기
          </button>
          <button type="button" className={`seg${dateMode === "date" ? " on" : ""}`} onClick={() => setDateMode(dateMode === "date" ? "rel" : "date")}>
            실제 날짜로 보기
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>복기 메모</h3>
          <span className="hint">이 브라우저에만 저장돼요</span>
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="무엇을 보고 판단했는지, 다음엔 무엇을 볼지 적어두세요."
          rows={3}
          maxLength={1000}
        />
      </div>

      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => onSaveNote(memo)} disabled={saved}>
          {saved ? "복기 노트에 저장됨" : "복기 노트에 저장"}
        </button>
        <button type="button" className="btn primary" onClick={onNext}>{nextLabel}</button>
      </div>
    </section>
  );
}

export function Dist({ pct }: { pct: Record<Pick, number> }) {
  return (
    <div className="dist">
      <div className="dist-bar" aria-hidden>
        {(["up", "flat", "down"] as Pick[]).map((k) => (
          <span key={k} className={k} style={{ width: `${pct[k]}%` }} />
        ))}
      </div>
      <div className="dist-legend">
        {(["up", "flat", "down"] as Pick[]).map((k) => (
          <span key={k}><i className={k} />{PICK_LABEL[k]} {pct[k]}%</span>
        ))}
      </div>
    </div>
  );
}
