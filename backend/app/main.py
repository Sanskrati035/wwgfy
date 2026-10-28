"""FastAPI application: JSON API under /api + (optionally) the built React app."""
from __future__ import annotations

from datetime import date, time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .analytics import accuracy_view, forecast_view
from .store import delivery_days, get_data

app = FastAPI(title="WindWatch API", version="1.0.0",
              description="Day-ahead wind forecast decision support (Elexon FUELHH / WINDFOR).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _parse_time(s: str | None) -> time:
    if not s:
        return config.DEFAULT_CUTOFF
    try:
        return time.fromisoformat(s)
    except ValueError:
        raise HTTPException(422, "cutoff must be HH:MM")


def _parse_day(s: str) -> date:
    try:
        d = date.fromisoformat(s)
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")
    return d


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    data = get_data()
    days = delivery_days()
    return {
        "source": data.source,
        "fetched_at": data.fetched_at,
        "delivery_days": [d.isoformat() for d in days],
        "default_cutoff": config.DEFAULT_CUTOFF.strftime("%H:%M"),
        "n_actual_points": len(data.actuals),
        "n_forecast_points": sum(len(v) for v in data.forecasts.values()),
    }


@app.get("/api/forecast")
def forecast(day: str, cutoff: str | None = None):
    d, c = _parse_day(day), _parse_time(cutoff)
    days = delivery_days()
    if d not in days:
        raise HTTPException(404, f"{d} is outside the scoped delivery days {days[0]}..{days[-1]}")
    return forecast_view(get_data(), d, c, days)


@app.get("/api/accuracy")
def accuracy(start: str | None = None, end: str | None = None, cutoff: str | None = None):
    days = delivery_days()
    s = _parse_day(start) if start else days[0]
    e = _parse_day(end) if end else days[-1]
    if s > e:
        raise HTTPException(422, "start must be <= end")
    sel = [d for d in days if s <= d <= e]
    if not sel:
        raise HTTPException(404, "no delivery days in the requested range")
    return accuracy_view(get_data(), sel, _parse_time(cutoff))


# ---- serve the built SPA (Docker / single-container deployment) -------------
if config.STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=config.STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = config.STATIC_DIR / path
        return FileResponse(f if path and f.is_file() else config.STATIC_DIR / "index.html")
