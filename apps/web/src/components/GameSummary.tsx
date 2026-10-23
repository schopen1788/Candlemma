import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type GameView, type RankingEntry } from '../lib/api';

export default function GameSummary({ view, onHome, onAgain }: { view: GameView; onHome: () => void; onAgain: () => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(view.game.registered);
  const [me, setMe] = useState<RankingEntry | null>(null);
  const [updated, setUpdated] = useState(false);
  const submitting = useRef(false);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (view.game.registered) api.myRanking().then(r => setMe(r.me)).catch(() => {});
  }, [view.game.registered]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.register(view.game.id, nickname);
      setMe(result.me);
      setUpdated(result.updated);
      setRegistered(true);
    } catch (err) {
      // A response can be lost after the transaction committed. Recover before allowing a retry.
      try {
        const current = await api.game(view.game.id);
        if (!current.game.registered) throw err;
        const result = await api.myRanking();
        setMe(result.me);
        setRegistered(true);
      } catch {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };
  return <section className="game-summary">
    <p className="eyebrow">10문제 도전 완료</p>
    <h1 className="page-title">멈춘 차트 10개, 나의 판단은</h1>
    <dl className="score-line">
      <div><dt>획득 점수</dt><dd>{view.game.score.toLocaleString('ko-KR')}<small> / 1,200점</small></dd></div>
      <div><dt>정답 수</dt><dd>{view.game.correct_count}<small> / 10문제</small></dd></div>
      <div><dt>정답률</dt><dd>{view.game.accuracy}<small>%</small></dd></div>
    </dl>
    <p className="muted small">방향 정답 100점 + 근거 일치 20점 · 문제당 최대 120점</p>
    {registered ? <div className="registration-status" role="status">
      <h2>{me ? `내 최고 기록은 ${me.rank.toLocaleString('ko-KR')}위` : '랭킹에 등록했어요'}</h2>
      {me && <p><b>{me.nickname}</b> · {me.score.toLocaleString('ko-KR')}점 · 정답률 {me.accuracy}%</p>}
      <p className="muted small">{updated ? '최고 기록을 저장했어요.' : '같은 브라우저에서는 가장 높은 기록 하나가 표시돼요.'}</p>
      <a className="btn primary" href="#/ranking">전체 랭킹 보기 →</a>
    </div> : <form className="nickname-form" onSubmit={submit}>
      <h2>내 기록을 랭킹에 남기기</h2>
      <label htmlFor="nickname">닉네임</label>
      <div className="nickname-row">
        <input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} minLength={2} maxLength={16}
          required autoComplete="nickname" placeholder="차트를 읽는 나의 이름" aria-describedby="nickname-help nickname-error" disabled={busy} />
        <button className="btn primary" type="submit" disabled={busy || Array.from(nickname.trim()).length < 2}>
          {busy ? '등록하는 중…' : '랭킹 등록'}
        </button>
      </div>
      <p className="hint" id="nickname-help">2~16자 · 한글, 영문 등 문자와 숫자, 공백, 밑줄 · 같은 이름도 사용할 수 있어요.</p>
      <p className="form-error" role={error ? 'alert' : undefined} id="nickname-error">{error}</p>
      <p className="muted small">등록한 닉네임과 최고 기록만 공개돼요. 등록하지 않아도 게임을 즐길 수 있어요.</p>
      <button type="button" className="link" onClick={onHome} disabled={busy}>랭킹 등록 건너뛰기 →</button>
    </form>}
    <p className="hint identity-note">이 브라우저의 쿠키로 내 기록을 확인해요. 브라우저 데이터를 지우거나 기기를 바꾸면 기록 연결이 끊어질 수 있어요.</p>
    <div className="actions"><button type="button" className="btn ghost" onClick={onHome} disabled={busy}>처음으로</button>
      <button type="button" className="btn primary" onClick={onAgain} disabled={busy}>새 도전 시작</button></div>
  </section>;
}
