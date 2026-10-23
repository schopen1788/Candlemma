import { useEffect, useState } from "react";
import { api, type Filters, type Meta } from "./lib/api";
import { prefs, themePref, type ThemePref } from "./lib/storage";
import Home from "./pages/Home";
import Notes from "./pages/Notes";
import Practice from "./pages/Practice";

type Route = "home" | "practice" | "notes";

function routeFromHash(): Route {
  const h = location.hash.replace("#/", "");
  return h === "practice" || h === "notes" ? h : "home";
}

function systemDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState("");
  const [filters, setFiltersState] = useState<Filters>(prefs.filters());
  const [pref, setPref] = useState<ThemePref>(themePref.get());
  const [sysDark, setSysDark] = useState(systemDark());
  const theme = pref === "system" ? (sysDark ? "dark" : "light") : pref;

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMq = () => setSysDark(mq.matches);
    mq?.addEventListener("change", onMq);
    api.meta().then(setMeta).catch((e) => setMetaError(e.message));
    return () => {
      window.removeEventListener("hashchange", onHash);
      mq?.removeEventListener("change", onMq);
    };
  }, []);

  // 자식 차트가 effect 에서 CSS 변수를 읽기 전에 테마가 적용돼 있어야 한다
  document.documentElement.dataset.theme = theme;

  const go = (r: Route) => {
    location.hash = r === "home" ? "#/" : `#/${r}`;
    window.scrollTo(0, 0);
  };
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    prefs.setFilters(f);
  };
  const cycleTheme = () => {
    const next: ThemePref = theme === "dark" ? "light" : "dark";
    setPref(next);
    themePref.set(next);
  };

  return (
    <div className="app">
      <header className="top">
        <a className="logo" href="#/" onClick={() => go("home")}>
          <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden>
            <path d="M10 7v18M22 5v20M16 9v14" stroke="currentColor" strokeWidth="1.6" opacity=".5" />
            <rect x="7.5" y="11" width="5" height="9" rx="1" fill="var(--up)" />
            <rect x="13.5" y="13" width="5" height="6" rx="1" fill="var(--down)" />
            <rect x="19.5" y="8" width="5" height="11" rx="1" fill="var(--up)" />
          </svg>
          <span>차트 맞히기</span>
          <small>Candlemma</small>
        </a>
        <nav>
          <a href="#/practice" className={route === "practice" ? "on" : ""}>연습</a>
          <a href="#/notes" className={route === "notes" ? "on" : ""}>복기 노트</a>
          <button type="button" className="icon" onClick={cycleTheme} aria-label={theme === "dark" ? "라이트 테마로" : "다크 테마로"}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </nav>
      </header>

      <main>
        {route === "home" && <Home meta={meta} metaError={metaError} filters={filters} setFilters={setFilters} onStart={() => go("practice")} />}
        {route === "practice" && <Practice meta={meta} filters={filters} theme={theme} onHome={() => go("home")} />}
        {route === "notes" && <Notes />}
      </main>

      <footer>
        <p><b>과거 데이터 기반 학습용 게임이며 투자 권유가 아닙니다.</b></p>
        <p>
          시세: FinanceDataReader(네이버 금융) 수정주가 · 거래대금은 종가×거래량 추정치 · 차트:{" "}
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a>
        </p>
      </footer>
    </div>
  );
}
