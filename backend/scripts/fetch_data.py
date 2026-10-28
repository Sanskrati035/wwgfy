"""Download Jan-2026 wind actuals + forecasts from Elexon and write a compact snapshot.

    python -m scripts.fetch_data            # from backend/
"""
import asyncio
from datetime import date, datetime, timezone

import httpx

from app import config
from app.elexon import fetch_actuals, fetch_forecasts
from app.models import WindData


async def main():
    async with httpx.AsyncClient(headers={"Accept": "application/json"}) as client:
        print("Fetching FUELHH (WIND actuals) ...")
        actuals = await fetch_actuals(client, date(2026, 1, 1), date(2026, 2, 2))
        print(f"  {len(actuals)} half-hours")
        print("Fetching WINDFOR (forecasts) ...")
        forecasts = await fetch_forecasts(client, date(2026, 1, 1), date(2026, 1, 31))
        print(f"  {len(forecasts)} forecast rows")
    if not actuals or not forecasts:
        raise SystemExit("Elexon returned no data - check connectivity / parameters.")
    data = WindData.from_rows("elexon", actuals, forecasts,
                              fetched_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    data.save(config.SNAPSHOT_PATH)
    print(f"Saved {config.SNAPSHOT_PATH} ({config.SNAPSHOT_PATH.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
