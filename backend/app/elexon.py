"""Thin async client for the Elexon Insights (BMRS) API - FUELHH (actuals) & WINDFOR (forecasts)."""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone

import httpx

from .config import ELEXON_BASE_URL


def parse_ts(s: str) -> int:
    s = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


async def _get_json(client: httpx.AsyncClient, url: str, params: dict, retries: int = 4) -> list[dict]:
    for attempt in range(retries):
        try:
            resp = await client.get(url, params=params, timeout=60)
            resp.raise_for_status()
            body = resp.json()
            return body["data"] if isinstance(body, dict) else body
        except (httpx.HTTPError, ValueError):
            if attempt == retries - 1:
                raise
            await asyncio.sleep(1.5 * 2**attempt)
    return []


async def fetch_actuals(client: httpx.AsyncClient, start: date, end: date) -> list[tuple[int, float]]:
    """FUELHH stream, fuelType=WIND. Returns [(startTime epoch, generation MW)]."""
    out: dict[int, float] = {}
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=6), end)
        rows = await _get_json(
            client, f"{ELEXON_BASE_URL}/datasets/FUELHH/stream",
            {"settlementDateFrom": cur.isoformat(), "settlementDateTo": chunk_end.isoformat(), "fuelType": "WIND"},
        )
        for row in rows:
            if row.get("fuelType") == "WIND" and row.get("generation") is not None:
                out[parse_ts(row["startTime"])] = float(row["generation"])
        cur = chunk_end + timedelta(days=1)
    return sorted(out.items())


async def fetch_forecasts(client: httpx.AsyncClient, start: date, end: date, concurrency: int = 4):
    """WINDFOR stream by publish-time window (1 day per request).

    Returns [(publishTime epoch, startTime epoch, generation MW)].
    """
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    sem = asyncio.Semaphore(concurrency)

    async def one(day: date):
        async with sem:
            frm = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
            to = frm + timedelta(days=1)
            rows = await _get_json(
                client, f"{ELEXON_BASE_URL}/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": frm.strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "publishDateTimeTo": to.strftime("%Y-%m-%dT%H:%M:%SZ")},
            )
            return [
                (parse_ts(x["publishTime"]), parse_ts(x["startTime"]), float(x["generation"]))
                for x in rows if x.get("generation") is not None
            ]

    results = await asyncio.gather(*(one(d) for d in days))
    return [row for chunk in results for row in chunk]
