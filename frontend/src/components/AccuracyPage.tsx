import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { api } from "../api";
import type { AccuracyResp } from "../types";
import { downloadCsv, num, shortDay } from "../format";
import { Card, ErrorBox, Kpi, Loading, Tip } from "./ui";

const axis = { tick: { fill: "var(--muted)", fontSize: 11 }, stroke: "var(--line)" };

export default function AccuracyPage({ days, cutoff, onPickDay }: { days: string[]; cutoff: string; onPickDay: (d: string) => void }) {
  const [start, setStart] = useState(days[0]);
  const [end, setEnd] = useState(days[days.length - 1]);
  const [data, setData] = useState<AccuracyResp | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (start > end) return;
    setData(null); setErr("");
    api.accuracy(start, end, cutoff).then(setData).catch((e) => setErr(e.message));
  }, [start, end, cutoff]);

  const o = data?.overall;
  const maxMae = Math.max(1, ...(data?.by_day.map((d) => d.mae) ?? [1]));

  return (
    <>
      <div className="controls">
        <div className="field"><label>From (delivery day)</label><input type="date" value={start} min={days[0]} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} /></div>
        <div className="field"><label>To</label><input type="date" value={end} min={start} max={days[days.length - 1]} onChange={(e) => e.target.value && setEnd(e.target.value)} /></div>
        <button className="btn" onClick={() => { setStart(days[0]); setEnd(days[days.length - 1]); }}>Full month</button>
        <div className="spacer" />
        <div className="hint">Error = forecast − actual. Evaluated on the forecast available at gate closure ({cutoff} UK, D−1) unless stated.</div>
        <button className="btn" disabled={!data} onClick={() => data && downloadCsv("accuracy-by-day.csv", data.by_day as any)}>⬇ Export CSV</button>
      </div>

      {err && <ErrorBox msg={err} />}
      {!data && !err && <Loading />}
      {data && o && (
        <>
          <div className="grid kpis">
            <Kpi accent label="Mean absolute error" value={num(o.mae)} unit="MW" note={`${o.wmape}% of generated energy (WMAPE)`} />
            <Kpi label="RMSE" value={num(o.rmse)} unit="MW" note="penalises large misses" />
            <Kpi label="Bias" value={`${o.bias > 0 ? "+" : ""}${num(o.bias)}`} unit="MW" note={<span className={`tag ${o.bias > 0 ? "bad" : "good"}`}>{o.bias > 0 ? "over-forecasts wind" : "under-forecasts wind"} · {o.over_share}% periods over</span>} />
            <Kpi label="90% of errors within" value={`±${num(o.p90_abs)}`} unit="MW" note={`95%: ±${num(o.p95_abs)} MW`} />
            <Kpi label="Worst shortfall exposure" value={num(o.max_over)} unit="MW" note={`worst under-forecast ${num(o.max_under)} MW · n=${num(o.n)}`} />
          </div>

          <div className="grid" style={{ marginBottom: 16 }}>
            <Card title="Key takeaways" sub="Auto-generated from the selected period">
              <div className="insights">
                {data.insights.map((i) => <div key={i.title} className={`insight ${i.tone}`}><b>{i.title}</b><span>{i.body}</span></div>)}
              </div>
            </Card>
          </div>

          <div className="grid two">
            <Card title="Error vs forecast lead time" sub="All forecast runs (not only the decision-time one), grouped by hours between publication and delivery.">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.by_horizon.map((h) => ({ ...h, label: `${h.from_h}–${h.to_h}h` }))}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" {...axis} interval={1} />
                  <YAxis {...axis} width={44} />
                  <Tooltip content={<Tip rows={(p) => [["Lead time", `${p.from_h}–${p.to_h} h`], ["MAE", `${num(p.mae)} MW`], ["RMSE", `${num(p.rmse)} MW`], ["Bias", `${num(p.bias)} MW`], ["Samples", num(p.n)]]} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="mae" name="MAE (MW)" fill="var(--forecast)" radius={[4, 4, 0, 0]} />
                  <Line dataKey="rmse" name="RMSE (MW)" stroke="var(--actual)" strokeWidth={2} dot={false} />
                  <Line dataKey="bias" name="Bias (MW)" stroke="var(--final)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Error by time of day" sub="UK local hour of delivery — when is the forecast least reliable?">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.by_hour}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" {...axis} tickFormatter={(h) => `${h}:00`} interval={2} />
                  <YAxis {...axis} width={44} />
                  <ReferenceLine y={0} stroke="var(--muted)" />
                  <Tooltip content={<Tip rows={(p) => [["Hour", `${p.hour}:00`], ["MAE", `${num(p.mae)} MW`], ["Bias", `${num(p.bias)} MW`], ["Samples", num(p.n)]]} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="mae" name="MAE (MW)" fill="var(--forecast)" radius={[4, 4, 0, 0]} />
                  <Line dataKey="bias" name="Bias (MW)" stroke="var(--actual)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Daily error trend" sub="Click a bar to open that delivery day.">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.by_day} onClick={(s: any) => s?.activeLabel && onPickDay(s.activeLabel)}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" {...axis} tickFormatter={shortDay} interval={Math.max(0, Math.floor(data.by_day.length / 8) - 1)} />
                  <YAxis {...axis} width={44} />
                  <Tooltip cursor={{ fill: "var(--band)" }} content={<Tip rows={(p) => [["Day", shortDay(p.day)], ["MAE", `${num(p.mae)} MW`], ["Bias", `${num(p.bias)} MW`], ["WMAPE", `${p.wmape}%`], ["Avg wind", `${num(p.mean_actual)} MW`]]} />} />
                  <Bar dataKey="mae" name="MAE (MW)" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }}>
                    {data.by_day.map((d) => <Cell key={d.day} fill={d.bias > 0 ? "var(--actual)" : "var(--forecast)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="legend"><span><i style={{ background: "var(--actual)" }} />day over-forecast wind (bias &gt; 0)</span><span><i style={{ background: "var(--forecast)" }} />under-forecast</span></div>
            </Card>

            <Card title="Error distribution" sub="Forecast − actual, 250 MW buckets. Right tail = shortfall risk.">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.histogram}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mid" {...axis} type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <YAxis {...axis} width={36} />
                  <ReferenceLine x={0} stroke="var(--muted)" />
                  <Tooltip cursor={{ fill: "var(--band)" }} content={<Tip rows={(p) => [["Error", `${p.from} to ${p.to} MW`], ["Half-hours", num(p.count)]]} />} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {data.histogram.map((h) => <Cell key={h.from} fill={h.mid > 0 ? "var(--actual)" : "var(--forecast)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="legend">
                {Object.entries(data.error_percentiles).map(([k, v]) => <span key={k}><b>{k.toUpperCase()}</b>&nbsp;{v > 0 ? "+" : ""}{num(v)}</span>)}
              </div>
            </Card>

            <Card title="Forecast vs actual" sub="Each dot is a half-hour; the closer to the diagonal, the better.">
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ left: 0, right: 10 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="0" name="Actual" {...axis} tickFormatter={(v) => `${v / 1000}k`} label={{ value: "Actual (MW)", position: "insideBottom", offset: -2, fill: "var(--muted)", fontSize: 11 }} height={40} />
                  <YAxis type="number" dataKey="1" name="Forecast" {...axis} tickFormatter={(v) => `${v / 1000}k`} width={40} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: number) => `${num(v)} MW`} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 18000, y: 18000 }]} stroke="var(--muted)" strokeDasharray="4 4" />
                  <Scatter data={data.scatter.map(([a, f]) => ({ 0: a, 1: f }))} fill="var(--forecast)" fillOpacity={0.5} />
                </ScatterChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Daily scorecard" sub="Click a row to open that day in the Day-ahead view.">
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table>
                  <thead><tr><th>Day</th><th>MAE</th><th>Bias</th><th>WMAPE</th><th>Avg wind</th></tr></thead>
                  <tbody>
                    {data.by_day.map((d) => (
                      <tr key={d.day} className="click" onClick={() => onPickDay(d.day)}>
                        <td>{shortDay(d.day)}</td>
                        <td>{num(d.mae)}<span className="bar" style={{ width: `${(d.mae / maxMae) * 50}px` }} /></td>
                        <td style={{ color: d.bias > 0 ? "var(--bad)" : "var(--good)" }}>{d.bias > 0 ? "+" : ""}{num(d.bias)}</td>
                        <td>{d.wmape}%</td><td>{num(d.mean_actual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
