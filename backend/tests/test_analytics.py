from datetime import date, time

from app.analytics import accuracy_view, cutoff_epoch, day_targets, forecast_view, metrics, quantile
from app.models import WindData

DAY = date(2026, 1, 10)


def test_cutoff_is_previous_day_local():
    # January = GMT, so 09:20 local == 09:20 UTC on D-1
    import datetime as dt
    assert dt.datetime.fromtimestamp(cutoff_epoch(DAY, time(9, 20)), dt.timezone.utc).isoformat() == "2026-01-09T09:20:00+00:00"


def test_day_has_48_periods_in_january():
    assert len(day_targets(DAY)) == 48


def test_latest_forecast_respects_gate_closure():
    t = day_targets(DAY)[0]
    co = cutoff_epoch(DAY, time(9, 20))
    d = WindData.from_rows("t", [(t, 100)], [(co - 7200, t, 500), (co - 60, t, 600), (co + 60, t, 999)])
    assert d.latest_before(t, co) == (co - 60, 600)  # 999 was published AFTER the decision
    assert d.latest_before(t, co - 7300) is None


def test_metrics_sign_and_values():
    m = metrics([(110, 100), (90, 100), (130, 100)])
    assert m["bias"] == 10.0 and m["mae"] == 16.7 and m["max_over"] == 30.0 and m["max_under"] == -10.0


def test_quantile():
    assert quantile([1, 2, 3, 4, 5], 0.5) == 3
    assert quantile([0, 10], 0.25) == 2.5


def test_views_end_to_end_on_synthetic():
    from app.synthetic import generate
    from app.store import delivery_days
    data, days = generate(), delivery_days()
    fv = forecast_view(data, days[10], time(9, 20), days)
    assert len(fv["points"]) == 48 and fv["summary"]["coverage"] == 48
    # no point may use a forecast published after gate closure
    assert all(p["publish"] <= "2026-01-%02dT09:20:00Z" % (days[10].day - 1) for p in fv["points"])
    av = accuracy_view(data, days, time(9, 20))
    assert av["overall"]["n"] > 1000 and av["by_horizon"] and av["histogram"]
    hz = [b["mae"] for b in av["by_horizon"]]
    assert hz[-1] > hz[0]  # error grows with lead time
