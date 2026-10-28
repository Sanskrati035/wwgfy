import type { ReactNode } from "react";

export function Kpi({ label, value, unit, note, accent }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; accent?: boolean }) {
  return (
    <div className={`card kpi ${accent ? "accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Card({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head"><div><h3>{title}</h3>{sub && <p className="sub">{sub}</p>}</div>{right}</div>
      {children}
    </div>
  );
}

export function Loading() { return <div className="state"><div className="spinner" />Loading data…</div>; }
export function ErrorBox({ msg }: { msg: string }) { return <div className="state error">⚠ {msg}</div>; }

export function Tip({ active, payload, label, rows }: { active?: boolean; payload?: any[]; label?: any; rows: (p: any) => [string, string][] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tooltip">
      <b>{typeof label === "string" || typeof label === "number" ? label : ""}</b>
      {rows(p).map(([k, v]) => <div className="row" key={k}><span>{k}</span><span>{v}</span></div>)}
    </div>
  );
}
