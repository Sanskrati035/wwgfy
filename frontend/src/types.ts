export interface Meta {
  source: "elexon" | "synthetic"; fetched_at: string | null; delivery_days: string[];
  default_cutoff: string; n_actual_points: number; n_forecast_points: number;
}
export interface Metrics {
  n: number; mae: number; rmse: number; bias: number; wmape: number | null; p90_abs: number; p95_abs: number;
  max_over: number; max_under: number; mean_actual: number; over_share: number;
}
export interface Point {
  t: string; hour: number; forecast: number | null; actual: number | null; final: number | null;
  publish: string | null; horizon_h: number | null; lo: number | null; hi: number | null;
}
export interface Band { q10: number; q50: number; q90: number; n: number; basis: string }
export interface ForecastResp {
  day: string; points: Point[]; vintages: { publish: string; values: (number | null)[] }[];
  band: Band | null;
  summary: {
    gate_closure: string; latest_publish: string | null; forecast_mwh: number | null; forecast_avg_mw: number | null;
    forecast_peak_mw: number | null; forecast_min_mw: number | null; actual_mwh: number | null; periods: number;
    coverage: number; buffer_mw_p90: number | null; day_metrics: Metrics | null;
  };
}
export interface Insight { tone: "warn" | "info"; title: string; body: string }
export interface AccuracyResp {
  overall: Metrics;
  by_day: ({ day: string } & Metrics)[];
  by_hour: { hour: number; mae: number; rmse: number; bias: number; n: number }[];
  by_horizon: { from_h: number; to_h: number; mae: number; rmse: number; bias: number; wmape: number | null; n: number }[];
  histogram: { from: number; to: number; mid: number; count: number }[];
  error_percentiles: Record<string, number>;
  scatter: [number, number][];
  insights: Insight[];
}
