import { useEffect, useState } from 'react';
import { api, type RankingData } from '../lib/api';

export default function Ranking() {
  const [data, setData] = useState<RankingData | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    api.ranking().then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  return <section className="ranking-page">
    <div className="ranking-heading"><div><p className="eyebrow">차트를 읽는 사람들</p><h1 className="page-title">전체 랭킹</h1></div>
      <a className="btn primary" href="#/challenge">10문제 도전 →</a></div>
    <p className="muted small">10문제 · T+3 · 문제당 120초 · 최고 1,200점</p>
    <p className="hint">상승 +0.5% 초과 · 보합 −0.5%~+0.5% · 하락 −0.5% 미만</p>
    {error ? <div className="empty" role="alert"><p>{error}</p><button className="btn ghost" onClick={() => setAttempt(a => a + 1)}>다시 불러오기</button></div>
      : !data ? <p className="empty" role="status">랭킹을 불러오는 중…</p> : <>
        <div className="my-ranking" role="status">
          <span className="eyebrow">내 최고 기록</span>
          {data.me ? <><strong>{data.me.rank.toLocaleString('ko-KR')}위 <span>{data.me.nickname}</span></strong>
            <p>{data.me.score.toLocaleString('ko-KR')}점 · {data.me.correct_count}/10 정답 · 정답률 {data.me.accuracy}%</p></>
            : <p>아직 등록한 기록이 없어요. 10문제를 풀고 원하는 닉네임으로 참여해 보세요.</p>}
        </div>
        <div className="card-head"><h2 className="section-title">TOP 100</h2><span className="hint">총 {data.total.toLocaleString('ko-KR')}명</span></div>
        {data.entries.length === 0 ? <div className="empty"><p>첫 번째 차트 독자가 되어 주세요.</p><p className="small">도전을 완료하고 등록한 기록이 이곳에 표시돼요.</p></div>
          : <table className="ranking-table"><caption className="sr-only">전체 상위 100명 랭킹. 점수, 정답 수, 먼저 등록한 순서로 정렬합니다.</caption>
            <thead><tr><th scope="col">순위</th><th scope="col">닉네임</th><th scope="col">점수</th><th scope="col">정답률</th></tr></thead>
            <tbody>{data.entries.map(e => <tr key={e.rank} className={`${e.is_me ? 'mine' : ''} ${e.rank <= 3 ? `podium place-${e.rank}` : ''}`}>
              <td><b className="rank-number">{e.rank}</b></td><td><span className="ranking-name">{e.nickname}</span>{e.is_me && <span className="me-label">나</span>}</td>
              <td><b>{e.score.toLocaleString('ko-KR')}</b></td><td>{e.accuracy}%<small>{e.correct_count}/10 정답</small></td>
            </tr>)}</tbody>
          </table>}
      </>}
    <p className="hint ranking-rules">방향 정답 100점 + 근거 일치 20점. 점수 → 정답 수 → 해당 기록 등록 시각 순으로 순위를 정해요. 모두 같으면 방문자 ID 순으로 정렬해요. 같은 방문자의 동점 기록은 먼저 등록한 기록을 유지해요.</p>
    <p className="hint">내 기록은 이 브라우저의 쿠키로 연결돼요. 쿠키 삭제나 기기 변경 시 기존 기록을 연결할 수 없어요.</p>
  </section>;
}
