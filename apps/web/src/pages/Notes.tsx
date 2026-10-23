import { useState } from "react";
import { PICK_LABEL } from "../lib/api";
import { notes as store } from "../lib/storage";

export default function Notes() {
  const [list, setList] = useState(store.list());
  const remove = (id: string) => {
    store.remove(id);
    setList(store.list());
  };
  return (
    <div className="notes">
      <h1 className="page-title">복기 노트</h1>
      <p className="muted small">결과 화면에서 저장한 문제가 여기에 모여요. 이 브라우저에만 저장돼요.</p>
      {list.length === 0 && <div className="card empty">아직 저장한 문제가 없어요.</div>}
      {list.map((n) => (
        <article key={n.id} className="card note">
          <div className="card-head">
            <h3>{n.name} <span className="muted small">{n.date}</span></h3>
            <span className={`badge ${n.pick === n.answer ? "ok" : ""}`}>{n.pick === n.answer ? "정답" : "오답"}</span>
          </div>
          <p className="small">
            {n.pattern} · T+{n.horizon} {n.change > 0 ? "+" : ""}{n.change.toFixed(2)}% · 정답 {PICK_LABEL[n.answer]} / 내 판단 {n.pick ? PICK_LABEL[n.pick] : "시간 초과"}
          </p>
          <p className="small muted">내 근거: {n.my_tags.join(", ")} · 핵심 근거: {n.key_tags.join(", ")}</p>
          {n.text && <p className="memo">{n.text}</p>}
          <button type="button" className="link small" onClick={() => remove(n.id)}>삭제</button>
        </article>
      ))}
    </div>
  );
}
