"""In-memory data model + lookup helpers."""
from __future__ import annotations

import gzip
import json
from bisect import bisect_right
from dataclasses import dataclass, field
from pathlib import Path

HALF_HOUR = 1800


@dataclass
class WindData:
    source: str  # "elexon" | "synthetic"
    fetched_at: str | None = None
    actuals: dict[int, float] = field(default_factory=dict)  # target epoch -> MW
    # target epoch -> sorted list of (publish epoch, MW)
    forecasts: dict[int, list[tuple[int, float]]] = field(default_factory=dict)

    @classmethod
    def from_rows(cls, source, actual_rows, forecast_rows, fetched_at=None) -> "WindData":
        d = cls(source=source, fetched_at=fetched_at)
        for target, gen in actual_rows:
            d.actuals[int(target)] = float(gen)
        tmp: dict[int, dict[int, float]] = {}
        for publish, target, gen in forecast_rows:
            tmp.setdefault(int(target), {})[int(publish)] = float(gen)  # dedupe
        for target, by_pub in tmp.items():
            d.forecasts[target] = sorted(by_pub.items())
        return d

    @classmethod
    def load(cls, path: Path) -> "WindData":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            raw = json.load(fh)
        return cls.from_rows(raw["source"], raw["actuals"], raw["forecasts"], raw.get("fetched_at"))

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "source": self.source,
            "fetched_at": self.fetched_at,
            "actuals": sorted(self.actuals.items()),
            "forecasts": [
                [pub, tgt, gen] for tgt, lst in sorted(self.forecasts.items()) for pub, gen in lst
            ],
        }
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            json.dump(payload, fh, separators=(",", ":"))

    def latest_before(self, target: int, cutoff: int) -> tuple[int, float] | None:
        """Most recent forecast for `target` published at or before `cutoff`."""
        lst = self.forecasts.get(target)
        if not lst:
            return None
        i = bisect_right(lst, (cutoff, float("inf")))
        return lst[i - 1] if i else None

    def forecast_rows(self):
        for tgt, lst in self.forecasts.items():
            for pub, gen in lst:
                yield pub, tgt, gen
