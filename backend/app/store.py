"""Loads the data snapshot once and caches it for the process lifetime."""
from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

from . import config
from .models import WindData
from .synthetic import generate


@lru_cache(maxsize=1)
def get_data() -> WindData:
    if config.SNAPSHOT_PATH.exists():
        return WindData.load(config.SNAPSHOT_PATH)
    if config.ALLOW_SYNTHETIC:
        return generate()
    raise RuntimeError(
        f"No data snapshot at {config.SNAPSHOT_PATH}. Run `python -m scripts.fetch_data` first."
    )


def delivery_days() -> list[date]:
    """Delivery days whose day-ahead decision falls inside the scoped month."""
    d0 = config.DECISION_MONTH_START + timedelta(days=1)
    d1 = config.DECISION_MONTH_END + timedelta(days=1)
    return [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
