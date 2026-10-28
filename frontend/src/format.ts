export const mw = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : `${v.toLocaleString("en-GB", { maximumFractionDigits: d })} MW`;
export const num = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: d });
export const gwh = (mwh: number | null | undefined) => (mwh == null ? "—" : `${(mwh / 1000).toFixed(1)} GWh`);
export const timeUK = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
export const dayLabel = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const shortDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => r[c] ?? "").join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
