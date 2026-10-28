import { useEffect, useState } from "react";
import { api } from "./api";
import type { Meta } from "./types";
import AccuracyPage from "./components/AccuracyPage";
import ForecastPage from "./components/ForecastPage";
import About from "./components/About";
import { ErrorBox, Loading } from "./components/ui";

type Tab = "forecast" | "accuracy" | "about";

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("forecast");
  const [day, setDay] = useState("");
  const [cutoff, setCutoff] = useState("09:20");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    (localStorage.getItem("theme") as "light" | "dark") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m); setCutoff(m.default_cutoff);
      setDay(m.delivery_days[Math.min(13, m.delivery_days.length - 1)]);
    }).catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🌬️</div>
          <div><h1>WindWatch</h1><p>Day-ahead wind forecast intelligence · GB</p></div>
        </div>
        <div className="top-actions">
          {meta && (
            <>
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <label title="Assumed day-ahead gate closure, UK time, on the day before delivery">Gate closure</label>
                <input type="time" value={cutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} style={{ minWidth: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 8px" }} />
              </div>
              <span className={`pill ${meta.source}`}><span className="dot" />{meta.source === "elexon" ? "Live Elexon data" : "Synthetic demo data"}</span>
            </>
          )}
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
      </header>

      {meta?.source === "synthetic" && (
        <div className="banner">⚠ Showing <b>synthetic demonstration data</b> — no Elexon snapshot is installed. Run <code>python -m scripts.fetch_data</code> in <code>backend/</code> to load the real January 2026 data.</div>
      )}

      <nav className="tabs">
        {([["forecast", "Day-ahead view"], ["accuracy", "Forecast accuracy"], ["about", "Method & assumptions"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {err && <ErrorBox msg={err} />}
      {!meta && !err && <Loading />}
      {meta && day && (
        <>
          {tab === "forecast" && <ForecastPage days={meta.delivery_days} day={day} setDay={setDay} cutoff={cutoff} />}
          {tab === "accuracy" && <AccuracyPage days={meta.delivery_days} cutoff={cutoff} onPickDay={(d) => { setDay(d); setTab("forecast"); }} />}
          {tab === "about" && <About />}
        </>
      )}
      <div className="footer">Data: Elexon Insights Solution (BMRS) — FUELHH &amp; WINDFOR · Built for day-ahead procurement decision support</div>
    </div>
  );
}
