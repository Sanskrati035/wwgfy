"""Core analytics: decision-time forecasts and accuracy evaluation.

Sign convention everywhere:  error = forecast - actual   (MW)
  error > 0  -> wind OVER-forecast -> buyer under-procures thermal -> shortfall exposure
  error < 0  -> wind UNDER-forecast -> buyer over-procures
"""
from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .models import HALF_HOUR, WindData

LONDON = ZoneInfo("Europe/London")
UTC = ZoneInfo("UTC")


# --------------------------------------------------------------------- time
def cutoff_epoch(delivery_day: date, cutoff: time) -> int:
    """Gate closure instant: `cutoff` UK-local time on the day BEFORE delivery."""
    dt = datetime.combine(delivery_day - timedelta(days=1), cutoff, tzinfo=LONDON)
    return int(dt.timestamp())


def day_targets(delivery_day: date) -> list[int]:
    """All half-hour start times (epoch) of a UK-local delivery day (46/48/50 periods)."""
    start = datetime.combine(delivery_day, time(0), tzinfo=LONDON)
    end = datetime.combine(delivery_day + timedelta(days=1), time(0), tzinfo=LONDON)
    out, t = [], int(start.timestamp())
    while t < int(end.timestamp()):
        out.append(t)
        t += HALF_HOUR
    return out


def iso(ts: int | None) -> str | None:
    return None if ts is None else datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_hour(ts: int) -> float:
    dt = datetime.fromtimestamp(ts, LONDON)
    return dt.hour + dt.minute / 60


# ------------------------------------------------------------------- maths
def quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return float("nan")
    pos = (len(sorted_vals) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def r(x: float | None, nd: int = 1) -> float | None:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(x, nd)


def metrics(pairs: list[tuple[float, float]]) -> dict:
    """pairs = [(forecast, actual)]. Returns the standard error summary."""
    n = len(pairs)
    if n == 0:
        return {"n": 0}
    errs = [f - a for f, a in pairs]
    abs_errs = sorted(abs(e) for e in errs)
    sum_actual = sum(a for _, a in pairs)
    mean_actual = sum_actual / n
    mae = sum(abs_errs) / n
    return {
        "n": n,
        "mae": r(mae),
        "rmse": r(math.sqrt(sum(e * e for e in errs) / n)),
        "bias": r(sum(errs) / n),
        "wmape": r(100 * sum(abs_errs) / sum_actual, 2) if sum_actual > 0 else None,
        "p90_abs": r(quantile(abs_errs, 0.90)),
        "p95_abs": r(quantile(abs_errs, 0.95)),
        "max_over": r(max(errs)),   # worst over-forecast (shortfall exposure)
        "max_under": r(min(errs)),  # worst under-forecast
        "mean_actual": r(mean_actual),
        "over_share": r(100 * sum(1 for e in errs if e > 0) / n, 1),
    }


# --------------------------------------------------------- decision pairs
def decision_pairs(data: WindData, days: list[date], cutoff: time) -> list[dict]:
    """For each delivery day/target: the latest forecast available at gate closure + actual."""
    rows = []
    for day in days:
        co = cutoff_epoch(day, cutoff)
        for t in day_targets(day):
            hit = data.latest_before(t, co)
            if hit is None:
                continue
            pub, fc = hit
            rows.append(
                {"day": day, "t": t, "pub": pub, "forecast": fc,
                 "actual": data.actuals.get(t), "horizon_h": (t - pub) / 3600}
            )
    return rows


def error_band(data: WindData, day: date, cutoff: time, all_days: list[date]) -> dict | None:
    """Empirical P10/P90 of (actual - forecast) using decision-time errors.

    Uses only delivery days strictly BEFORE `day` (no look-ahead) when >=3 days are
    available, otherwise falls back to all other days in scope.
    """
    prior = [d for d in all_days if d < day]
    basis, label = (prior, "prior days") if len(prior) >= 3 else ([d for d in all_days if d != day], "other days in scope")
    errs = sorted(
        row["actual"] - row["forecast"]
        for row in decision_pairs(data, basis, cutoff)
        if row["actual"] is not None
    )
    if len(errs) < 48:
        return None
    return {"q10": r(quantile(errs, 0.10)), "q50": r(quantile(errs, 0.50)),
            "q90": r(quantile(errs, 0.90)), "n": len(errs), "basis": label}


# --------------------------------------------------------- forecast view
def forecast_view(data: WindData, day: date, cutoff: time, all_days: list[date]) -> dict:
    co = cutoff_epoch(day, cutoff)
    targets = day_targets(day)
    band = error_band(data, day, cutoff, all_days)

    points, used_pubs = [], {}
    for t in targets:
        hit = data.latest_before(t, co)
        final = data.latest_before(t, t)  # latest forecast ever issued before delivery
        fc = hit[1] if hit else None
        p = {
            "t": iso(t), "hour": local_hour(t),
            "forecast": r(fc), "actual": r(data.actuals.get(t)),
            "final": r(final[1]) if final else None,
            "publish": iso(hit[0]) if hit else None,
            "horizon_h": r((t - hit[0]) / 3600, 1) if hit else None,
            "lo": None, "hi": None,
        }
        if fc is not None and band:
            p["lo"] = r(max(0.0, fc + band["q10"]))
            p["hi"] = r(fc + band["q90"])
        points.append(p)
        if hit:
            used_pubs[hit[0]] = used_pubs.get(hit[0], 0) + 1

    # forecast "vintages" - how the view of this day evolved up to gate closure
    pub_set = sorted({pub for t in targets for pub, _ in data.forecasts.get(t, []) if pub <= co})
    chosen = pub_set[-1:: -max(1, len(pub_set) // 6)][:6] if pub_set else []
    vintages = []
    for pub in sorted(chosen):
        vals = []
        for t in targets:
            m = dict(data.forecasts.get(t, []))
            vals.append(r(m.get(pub)))
        vintages.append({"publish": iso(pub), "values": vals})

    fvals = [p["forecast"] for p in points if p["forecast"] is not None]
    avals = [p["actual"] for p in points if p["actual"] is not None]
    pairs = [(p["forecast"], p["actual"]) for p in points if p["forecast"] is not None and p["actual"] is not None]
    summary = {
        "gate_closure": iso(co),
        "latest_publish": iso(max(used_pubs)) if used_pubs else None,
        "forecast_mwh": r(sum(fvals) * 0.5, 0) if fvals else None,
        "forecast_avg_mw": r(sum(fvals) / len(fvals), 0) if fvals else None,
        "forecast_peak_mw": r(max(fvals), 0) if fvals else None,
        "forecast_min_mw": r(min(fvals), 0) if fvals else None,
        "actual_mwh": r(sum(avals) * 0.5, 0) if avals else None,
        "periods": len(targets),
        "coverage": len(fvals),
        "buffer_mw_p90": r(max(0.0, -band["q10"]), 0) if band else None,
        "day_metrics": metrics(pairs) if pairs else None,
    }
    return {"day": day.isoformat(), "points": points, "vintages": vintages,
            "band": band, "summary": summary}


# -------------------------------------------------------- accuracy view
def accuracy_view(data: WindData, days: list[date], cutoff: time) -> dict:
    rows = [r_ for r_ in decision_pairs(data, days, cutoff) if r_["actual"] is not None]
    pairs = [(x["forecast"], x["actual"]) for x in rows]
    overall = metrics(pairs)

    # by delivery day
    by_day = []
    for d in days:
        sub = [(x["forecast"], x["actual"]) for x in rows if x["day"] == d]
        if sub:
            by_day.append({"day": d.isoformat(), **metrics(sub)})

    # by local hour of day
    by_hour = []
    for h in range(24):
        sub = [(x["forecast"], x["actual"]) for x in rows if int(local_hour(x["t"])) == h]
        if sub:
            m = metrics(sub)
            by_hour.append({"hour": h, "mae": m["mae"], "rmse": m["rmse"], "bias": m["bias"], "n": m["n"]})

    # by forecast horizon - uses EVERY published forecast (not just the decision-time one)
    in_scope = {t for d in days for t in day_targets(d)}
    bins: dict[int, list[tuple[float, float]]] = {}
    width, cap = 3, 96
    for pub, tgt, fc in data.forecast_rows():
        if tgt not in in_scope or tgt not in data.actuals:
            continue
        h = (tgt - pub) / 3600
        if h < 0 or h >= cap:
            continue
        bins.setdefault(int(h // width) * width, []).append((fc, data.actuals[tgt]))
    by_horizon = []
    for b in sorted(bins):
        m = metrics(bins[b])
        by_horizon.append({"from_h": b, "to_h": b + width, "mae": m["mae"], "rmse": m["rmse"],
                           "bias": m["bias"], "wmape": m["wmape"], "n": m["n"]})

    # error histogram (forecast - actual), 250 MW buckets
    errs = [f - a for f, a in pairs]
    hist = []
    if errs:
        w = 250
        lo = math.floor(min(errs) / w) * w
        hi = math.ceil(max(errs) / w) * w
        counts: dict[int, int] = {}
        for e in errs:
            k = int(math.floor(e / w) * w)
            counts[k] = counts.get(k, 0) + 1
        k = lo
        while k < hi:
            hist.append({"from": k, "to": k + w, "mid": k + w / 2, "count": counts.get(k, 0)})
            k += w

    err_sorted = sorted(errs)
    percentiles = {f"p{int(q*100)}": r(quantile(err_sorted, q)) for q in (0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95)} if errs else {}

    scatter = [[round(a), round(f)] for f, a in pairs[:: max(1, len(pairs) // 800)]]

    return {
        "overall": overall, "by_day": by_day, "by_hour": by_hour, "by_horizon": by_horizon,
        "histogram": hist, "error_percentiles": percentiles, "scatter": scatter,
        "insights": make_insights(overall, by_day, by_hour, by_horizon, percentiles),
    }


def make_insights(overall, by_day, by_hour, by_horizon, pct) -> list[dict]:
    out: list[dict] = []
    if not overall.get("n"):
        return out
    bias = overall["bias"]
    direction = "over-forecast" if bias > 0 else "under-forecast"
    out.append({
        "tone": "warn" if bias > 0 else "info",
        "title": f"Forecasts tend to {direction} wind by {abs(bias):,.0f} MW on average",
        "body": ("Over-forecasting means thermal is under-bought day-ahead, creating shortfall exposure in balancing."
                 if bias > 0 else
                 "Under-forecasting means some thermal is bought unnecessarily; wind surplus may be sold back at a cost."),
    })
    out.append({
        "tone": "info",
        "title": f"Typical error is {overall['mae']:,.0f} MW ({overall['wmape']}% of generation)",
        "body": f"RMSE {overall['rmse']:,.0f} MW; 90% of half-hours are within ±{overall['p90_abs']:,.0f} MW of actual.",
    })
    if pct:
        out.append({
            "tone": "warn",
            "title": f"Plan a ~{max(0, pct['p95']):,.0f} MW buffer for 1-in-20 shortfall",
            "body": f"In 5% of periods wind was over-forecast by at least {pct['p95']:,.0f} MW; in 5% it was under-forecast by {abs(pct['p5']):,.0f} MW or more.",
        })
    if by_day:
        worst = max(by_day, key=lambda d: d["mae"])
        best = min(by_day, key=lambda d: d["mae"])
        out.append({
            "tone": "info",
            "title": f"Hardest day: {worst['day']} (MAE {worst['mae']:,.0f} MW)",
            "body": f"Easiest day was {best['day']} (MAE {best['mae']:,.0f} MW) - error varies strongly with weather regime.",
        })
    if len(by_horizon) >= 3:
        first, last = by_horizon[0], by_horizon[-1]
        out.append({
            "tone": "info",
            "title": "Accuracy decays with lead time",
            "body": f"MAE rises from {first['mae']:,.0f} MW ({first['from_h']}-{first['to_h']}h ahead) to {last['mae']:,.0f} MW ({last['from_h']}-{last['to_h']}h ahead).",
        })
    return out
