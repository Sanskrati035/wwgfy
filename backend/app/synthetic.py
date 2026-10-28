"""Deterministic SYNTHETIC wind data - used only for offline demos/tests.

Never presented as real: the API reports source="synthetic" and the UI shows a banner.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timezone

from .models import HALF_HOUR, WindData

CAPACITY = 16000.0


def generate(start="2026-01-01", end="2026-02-02", seed=7) -> WindData:
    rng = random.Random(seed)
    t0 = int(datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp())
    t1 = int(datetime.fromisoformat(end).replace(tzinfo=timezone.utc).timestamp())

    # smooth "true" wind: sum of slow sinusoids + AR(1) noise, squashed to [0, capacity]
    phases = [rng.uniform(0, 6.28) for _ in range(3)]
    ar, truth = 0.0, {}
    for t in range(t0, t1 + 4 * 86400, HALF_HOUR):
        h = (t - t0) / 3600
        ar = 0.97 * ar + rng.gauss(0, 0.06)
        x = 0.9 * math.sin(h / 57 + phases[0]) + 0.6 * math.sin(h / 23 + phases[1]) + 0.3 * math.sin(h / 9 + phases[2]) + ar
        truth[t] = CAPACITY / (1 + math.exp(-1.4 * (x - 0.1)))
    actuals = [(t, truth[t] * (1 + rng.gauss(0, 0.01))) for t in range(t0, t1, HALF_HOUR)]

    forecasts = []
    err_state: dict[int, float] = {}
    for pub in range(t0, t1 - 86400, 3600):
        # forecast error is smoothly correlated across targets within one publish run
        e = 0.0
        for tgt in range(pub + HALF_HOUR, pub + 47 * 3600, HALF_HOUR):
            if tgt not in truth:
                break
            hz = (tgt - pub) / 3600
            sd = 150 + 95 * hz ** 0.85  # error grows with horizon
            e = 0.93 * e + rng.gauss(0, sd * 0.36)
            fc = min(CAPACITY, max(0.0, truth[tgt] + e + 40))
            forecasts.append((pub, tgt, fc))
    return WindData.from_rows("synthetic", actuals, forecasts, fetched_at=None)
