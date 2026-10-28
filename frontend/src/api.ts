import type { AccuracyResp, ForecastResp, Meta } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const res = await fetch(`${BASE}/api${path}${qs.size ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`${res.status} ${(await res.json().catch(() => ({}))).detail ?? res.statusText}`);
  return res.json();
}

export const api = {
  meta: () => get<Meta>("/meta"),
  forecast: (day: string, cutoff: string) => get<ForecastResp>("/forecast", { day, cutoff }),
  accuracy: (start: string, end: string, cutoff: string) => get<AccuracyResp>("/accuracy", { start, end, cutoff }),
};
