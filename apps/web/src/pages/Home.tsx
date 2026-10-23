import type { Filters, Meta } from "../lib/api";

const STEPS = [
  ["리플레이", "종목명·날짜를 가린 일봉이 하루씩 재생되다 멈춰요."],
  ["근거 고르기", "차트와 거래대금에서 본 근거를 1~3개 골라요."],
  ["판단", "정해진 기간 뒤 종가가 상승·보합·하락 중 어디일지 골라요."],
  ["복기", "이후 흐름, 해설, 같은 패턴의 과거 통계를 확인해요."],
];

export default function Home({ meta, filters, setFilters, onStart, metaError }: {
  meta: Meta | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  onStart: () => void;
  metaError: string;
}) {
  const total = meta?.patterns.reduce((s, p) => s + p.count, 0) ?? 0;
  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">차트 판독 훈련</p>
        <h1>멈춘 차트, 다음은 어디로?</h1>
        <p className="lead">
          실제 국내 상장 종목의 과거 일봉을 보고 이후 흐름을 판단해 보세요. 맞히는 게임이 아니라 <b>읽는</b> 게임이에요.
        </p>
      </section>

      <section className="card start">
        <div className="card-head">
          <h3>연습 모드</h3>
          <span className="hint">{total ? `문제 ${total.toLocaleString("ko-KR")}개` : metaError || "불러오는 중…"}</span>
        </div>
        <div className="filters">
          <label>
            <span>패턴</span>
            <select value={filters.pattern ?? ""} onChange={(e) => setFilters({ ...filters, pattern: e.target.value || undefined })}>
              <option value="">전체</option>
              {meta?.patterns.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.count})</option>
              ))}
            </select>
          </label>
          <label>
            <span>판정 기간</span>
            <select value={filters.horizon ?? ""} onChange={(e) => setFilters({ ...filters, horizon: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">전체</option>
              {meta && Object.entries(meta.horizons).map(([h, b]) => (
                <option key={h} value={h}>T+{h} (보합 ±{b}%)</option>
              ))}
            </select>
          </label>
          <label>
            <span>시장</span>
            <select value={filters.market ?? ""} onChange={(e) => setFilters({ ...filters, market: e.target.value || undefined })}>
              <option value="">전체</option>
              <option value="KOSPI">코스피</option>
              <option value="KOSDAQ">코스닥</option>
            </select>
          </label>
        </div>
        <button type="button" className="btn primary wide" onClick={onStart} disabled={!total}>연습 시작</button>
      </section>

      <section className="challenge-entry">
        <div><p className="eyebrow">10문제 도전</p><h2>열 번의 판단, 나의 기록</h2>
          <p className="muted small">T+3 · 문제당 120초 · 로그인 없이 플레이하고, 원하면 닉네임으로 랭킹에 참여해요.</p></div>
        <div className="challenge-links"><a className="btn primary" href="#/challenge">도전 시작 →</a><a href="#/ranking">전체 랭킹 보기</a></div>
      </section>

      <section className="steps">
        {STEPS.map(([t, d], i) => (
          <div key={t} className="step">
            <span className="num">{i + 1}</span>
            <div><b>{t}</b><p>{d}</p></div>
          </div>
        ))}
      </section>

      {meta && (
        <section>
          <h2 className="section-title">패턴 사전</h2>
          <div className="patterns">
            {meta.patterns.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pattern"
                onClick={() => { setFilters({ ...filters, pattern: p.id }); onStart(); }}
              >
                <b>{p.name}</b>
                <p>{p.desc}</p>
                <span className="hint">{p.count}문제 풀기 →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card soon">
        <h3>준비 중</h3>
        <p className="muted small">오늘의 차트, 일간·주간 랭킹, 레이팅 모드, 패턴 도장 코스는 다음 단계에서 열려요.</p>
      </section>
    </div>
  );
}
