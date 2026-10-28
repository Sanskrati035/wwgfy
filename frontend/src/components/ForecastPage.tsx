import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { ForecastResp } from "../types";
import { dayLabel, downloadCsv, gwh, hhmm, mw, num, timeUK } from "../format";
import { Card, ErrorBox, Kpi, Loading, Tip } from "./ui";

interface Props { days: string[]; day: string; setDay: (d: string) => void; cutoff: string }

export default function ForecastPage({ days, day, setDay, cutoff }: Props) {
  const [data, setData] = useState<ForecastResp | null>(null);
  const [err, setErr] = useState("");
  const [showBand, setShowBand] = useState(true);
  const [showFinal, setShowFinal] = useState(false);
  const [showVint, setShowVint] = useState(false);

  useEffect(() => {
    setData(null); setErr("");
    api.forecast(day, cutoff).then(setData).catch((e) => setErr(e.message));
  }, [day, cutoff]);

  const rows = useMemo(() => data?.points.map((p, i) => {
    const row: Record<string, any> = { ...p, label: hhmm(p.t), band: p.lo != null && p.hi != null ? [p.lo, p.hi] : null };
    data.vintages.forEach((v, k) => (row[`v${k}`] = v.values[i]));
    return row;
  }) ?? [], [data]);

  const idx = days.indexOf(day);
  const s = data?.summary;
  const dm = s?.day_metrics;

  return (
    <>
      <div className="controls">
        <div className="field">
          <label>Delivery day</label>
          <div className="stepper">
            <button className="btn" disabled={idx <= 0} onClick={() => setDay(days[idx - 1])}>←</button>
            <input type="date" value={day} min={days[0]} max={days[days.length - 1]} onChange={(e) => e.target.value && days.includes(e.target.value) && setDay(e.target.value)} />
            <button className="btn" disabled={idx >= days.length - 1} onClick={() => setDay(days[idx + 1])}>→</button>
          </div>
        </div>
        <div className="hint">
          Forecast <b>as it stood at gate closure</b> ({cutoff} UK on the previous day) — the information available when bidding for {dayLabel(day)}.
        </div>
        <div className="spacer" />
        <button className="btn" disabled={!data} onClick={() => data && downloadCsv(`wind-forecast-${day}.csv`, data.points.map((p) => ({ start_utc: p.t, forecast_mw: p.forecast, p10_mw: p.lo, p90_mw: p.hi, actual_mw: p.actual, forecast_published: p.publish, horizon_h: p.horizon_h })))}>⬇ Export CSV</button>
      </div>

      {err && <ErrorBox msg={err} />}
      {!data && !err && <Loading />}
      {data && s && (
        <>
          <div className="grid kpis">
            <Kpi accent label="Forecast energy" value={gwh(s.forecast_mwh)} note={`avg ${mw(s.forecast_avg_mw)} over ${s.coverage}/${s.periods} periods`} />
            <Kpi label="Peak / trough" value={num(s.forecast_peak_mw)} unit={`/ ${num(s.forecast_min_mw)} MW`} note="forecast max / min half-hour" />
            <Kpi label="Latest forecast used" value={timeUK(s.latest_publish)} note={`Gate closure ${timeUK(s.gate_closure)} (UK)`} />
            <Kpi label="Suggested shortfall buffer" value={num(s.buffer_mw_p90)} unit="MW" note={data.band ? `P10 error from ${data.band.n} historical periods (${data.band.basis})` : "not enough history"} />
            {dm && <Kpi label="Realised MAE (hindsight)" value={num(dm.mae)} unit="MW" note={<>bias <span className={`tag ${dm.bias > 0 ? "bad" : "good"}`}>{dm.bias > 0 ? "+" : ""}{num(dm.bias)} MW</span> · actual {gwh(s.actual_mwh)}</>} />}
          </div>

          <Card
            title={`Wind generation · ${dayLabel(day)}`}
            sub="Half-hourly national wind (MW). Shaded band = historical P10–P90 error range around the decision-time forecast."
            right={
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <label className="toggle"><input type="checkbox" checked={showBand} onChange={(e) => setShowBand(e.target.checked)} />Uncertainty band</label>
                <label className="toggle"><input type="checkbox" checked={showFinal} onChange={(e) => setShowFinal(e.target.checked)} />Final forecast</label>
                <label className="toggle"><input type="checkbox" checked={showVint} onChange={(e) => setShowVint(e.target.checked)} />Earlier runs</label>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" interval={5} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--line)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} label={{ value: "MW", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip content={<Tip rows={(p) => [
                  ["Forecast", mw(p.forecast)], ["Actual", mw(p.actual)],
                  ...(p.lo != null ? [["P10–P90", `${num(p.lo)}–${num(p.hi)} MW`] as [string, string]] : []),
                  ["Issued", timeUK(p.publish)], ["Lead time", p.horizon_h != null ? `${p.horizon_h} h` : "—"],
                  ...(p.actual != null && p.forecast != null ? [["Error", `${p.forecast - p.actual > 0 ? "+" : ""}${num(p.forecast - p.actual)} MW`] as [string, string]] : []),
                ]} />} labelFormatter={undefined} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {showBand && <Area dataKey="band" name="P10–P90 band" stroke="none" fill="var(--forecast)" fillOpacity={0.16} isAnimationActive={false} legendType="rect" />}
                {showVint && data.vintages.map((v, k) => (
                  <Line key={k} dataKey={`v${k}`} name={k === 0 ? "Earlier runs" : undefined} legendType={k === 0 ? "plainline" : "none"} stroke="var(--muted)" strokeOpacity={0.35} strokeWidth={1} dot={false} isAnimationActive={false} />
                ))}
                {showFinal && <Line dataKey="final" name="Final forecast (hindsight)" stroke="var(--final)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                <Line dataKey="forecast" name="Forecast at gate closure" stroke="var(--forecast)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line dataKey="actual" name="Actual" stroke="var(--actual)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div style={{ height: 16 }} />
          <Card title="Half-hour detail" sub="Every period with the forecast run that would have been used. Positive error = wind over-forecast (shortfall risk).">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Start (UK)</th><th>Forecast</th><th>P10</th><th>P90</th><th>Actual</th><th>Error</th><th>Issued</th><th>Lead</th></tr></thead>
                <tbody>
                  {data.points.map((p) => {
                    const e = p.forecast != null && p.actual != null ? p.forecast - p.actual : null;
                    return (
                      <tr key={p.t}>
                        <td>{hhmm(p.t)}</td><td>{num(p.forecast)}</td><td>{num(p.lo)}</td><td>{num(p.hi)}</td><td>{num(p.actual)}</td>
                        <td style={{ color: e == null ? undefined : e > 0 ? "var(--bad)" : "var(--good)" }}>{e == null ? "—" : `${e > 0 ? "+" : ""}${num(e)}`}</td>
                        <td>{timeUK(p.publish)}</td><td>{p.horizon_h ?? "—"} h</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
