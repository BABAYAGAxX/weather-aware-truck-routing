from datetime import datetime, timezone

import pytest
from django.core.cache import cache

from trips import planner, weather
from trips.domain.risk import Weather
from trips.planner import IntervalTooFine, plan_trip
from trips.tomtom import RouteData
from trips.weather import Forecast, OutOfForecast

DEPART = datetime(2026, 10, 31, 14, 0, tzinfo=timezone.utc)
ORIGIN, DESTINATION = (35.0, -100.0), (35.0, -98.0)


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


def straight_route(miles, hours, lon_span=2, lat=35.0):
    """A straight east-west route with known times at its two ends."""
    points = [(lat, -100.0 + lon_span * i / 100) for i in range(101)]
    return RouteData(points, miles, hours * 3600, [(0.0, 0), (miles, hours * 3600)])


def fake_forecast(winds, rain=0.0, snow=0.0):
    """A forecast starting at departure, one hour per wind value."""
    hours = len(winds)
    return Forecast(DEPART, list(winds), [20.0] * hours, [rain] * hours, [snow] * hours)


@pytest.fixture
def short_routes():
    # Same shape three times. Route B is an hour slower than A and C.
    return [straight_route(100, 2, 2), straight_route(100, 3, 2), straight_route(100, 2, 2)]


@pytest.fixture
def long_route():
    # Sized to stay over 500 locations with the 2 degree squares used over 1,500 mi.
    return [straight_route(6000, 90, 58)]


@pytest.fixture
def three_places():
    # A and C are equally fast to reach but C is slower. B is the fastest and runs far north.
    return [straight_route(100, 2), straight_route(100, 1, lat=36.0), straight_route(100, 3, lat=34.0)]


def storm_north(cell):
    """Calm everywhere except north of 35.5, which has a 50 mph gale."""
    return fake_forecast([50.0 if cell[0] >= 35.5 else 10.0] * 72)


@pytest.fixture
def plan(monkeypatch, short_routes):
    def run(routes=short_routes, weather=Weather(10, 0, 0), forecast_hours=72,
            load_lb=35_000, interval="auto", forecast_for=None):
        calm = fake_forecast([weather.wind_mph] * forecast_hours, weather.rain_in_hr, weather.snow_in_hr)
        forecast_at = forecast_for or (lambda cell: calm)
        monkeypatch.setattr(planner, "fetch_routes", lambda *args: routes)
        monkeypatch.setattr(planner, "get_forecasts", lambda cells: {cell: forecast_at(cell) for cell in cells})
        return plan_trip(ORIGIN, DESTINATION, DEPART, load_lb, interval)

    return run


def test_checkpoint_eta_comes_from_route_time(plan):
    checkpoint = plan()["routes"][0]["checkpoints"][1]
    assert checkpoint["mile"] == 10
    assert checkpoint["eta"] == "2026-10-31T14:12:00Z"


def test_one_interval_applies_to_all_routes(plan):
    assert {len(r["checkpoints"]) for r in plan(interval=25)["routes"]} == {5}


def test_load_changes_the_outcome(plan):
    windy = Weather(50, 0, 0)
    assert plan(weather=windy, load_lb=30_000)["routes"][0]["severe_miles"] == 100
    assert plan(weather=windy, load_lb=30_001)["routes"][0]["no_travel_miles"] == 100


def test_heatmap_has_49_hours_from_departure(plan):
    cells = plan()["heatmap"]["cells"]
    assert cells and all(len(cell["risk"]) == 49 for cell in cells)


def test_interval_refused_over_budget_whatever_is_cached(plan, long_route):
    with pytest.raises(IntervalTooFine):
        plan(routes=long_route, interval=10)


def test_auto_over_budget_says_the_trip_is_too_long(plan, long_route, monkeypatch):
    monkeypatch.setattr(planner, "MAX_LOCATIONS", 10)
    with pytest.raises(IntervalTooFine) as error:
        plan(routes=long_route, interval="auto")
    assert "too long" in str(error.value)
    assert "wider" not in str(error.value)


def test_auto_on_a_short_trip_over_budget_says_the_trip_is_too_long(plan, monkeypatch):
    monkeypatch.setattr(planner, "MAX_LOCATIONS", 10)
    with pytest.raises(IntervalTooFine, match="too long"):
        plan(interval="auto")


def test_chosen_50_over_budget_also_says_the_trip_is_too_long(plan, long_route, monkeypatch):
    monkeypatch.setattr(planner, "MAX_LOCATIONS", 10)
    with pytest.raises(IntervalTooFine, match="too long"):
        plan(routes=long_route, interval=50)


def test_chosen_interval_over_budget_asks_for_a_wider_one(plan, long_route):
    with pytest.raises(IntervalTooFine, match="choose a wider interval"):
        plan(routes=long_route, interval=10)


def test_interval_refused_over_budget_even_when_every_location_is_cached(monkeypatch, long_route):
    monkeypatch.setattr(planner, "fetch_routes", lambda *args: long_route)
    monkeypatch.setattr(weather, "_fetch", lambda cells: {cell: fake_forecast([10.0] * 100) for cell in cells})
    monkeypatch.setattr(planner, "MAX_LOCATIONS", 10_000)
    plan_trip(ORIGIN, DESTINATION, DEPART, 35_000, 10)  # warms the cache for every location
    monkeypatch.setattr(planner, "MAX_LOCATIONS", 500)
    with pytest.raises(IntervalTooFine):
        plan_trip(ORIGIN, DESTINATION, DEPART, 35_000, 10)


def test_time_past_forecast_is_an_error_not_low(plan):
    # The heatmap only needs 49 hours, so only the checkpoint at mile 100 (hour 60) can fail.
    with pytest.raises(OutOfForecast):
        plan(routes=[straight_route(100, 60)], forecast_hours=50)


def test_checkpoint_reads_the_forecast_hour_of_its_eta(plan):
    winds = [10 + 5 * hour for hour in range(72)]  # 10 mph at departure, 5 mph more each hour
    route = plan(forecast_for=lambda cell: fake_forecast(winds))["routes"][0]
    assert [c["wind_mph"] for c in route["checkpoints"]] == [10, 10, 10, 15, 15, 15, 15, 15, 20, 20, 20]


def test_route_through_a_storm_ranks_last(plan, three_places):
    routes = plan(routes=three_places, forecast_for=storm_north)["routes"]
    assert [r["id"] for r in routes] == ["A", "C", "B"]
    assert routes[2]["no_travel_miles"] == 100
    assert routes[0]["no_travel_miles"] == 0


def test_nothing_is_recommended_when_every_route_is_stormy(plan):
    routes = plan(forecast_for=lambda cell: fake_forecast([50.0] * 72))["routes"]
    assert [r["recommended"] for r in routes] == [False, False, False]


def test_only_best_route_has_a_reason(plan):
    routes = plan()["routes"]
    assert routes[0]["reason"] and all(r["reason"] is None for r in routes[1:])


def test_route_keeps_its_id_and_the_fastest_comes_first_when_risk_is_equal(plan):
    result = plan()
    assert [r["id"] for r in result["routes"]] == ["A", "C", "B"]
    assert [r["recommended"] for r in result["routes"]] == [True, False, False]


def test_response_shape(plan):
    result = plan()
    route = result["routes"][0]
    assert result["interval_miles"] == 10
    assert route["miles"] == 100.0
    assert route["duration_s"] == 7200
    assert route["arrival"] == "2026-10-31T16:00:00Z"
    assert route["geometry"][0] == [-100.0, 35.0]
    assert route["geometry"][-1] == [-98.0, 35.0]
    assert len(route["geometry"]) == 21  # points 0, 5, ..., 100
    assert route["checkpoints"][0] == {
        "mile": 0, "lat": 35.0, "lon": -100.0, "eta": "2026-10-31T14:00:00Z",
        "wind_mph": 10, "gust_mph": 20, "rain_in_hr": 0, "snow_in_hr": 0, "risk": 0, "cause": None,
    }
    assert result["heatmap"]["cell_deg"] == 0.25


def test_changing_only_the_interval_does_not_call_tomtom_again(monkeypatch, short_routes):
    calls = []
    monkeypatch.setattr(planner, "fetch_routes", lambda *args: calls.append(args) or short_routes)
    monkeypatch.setattr(planner, "get_forecasts", lambda cells: {cell: fake_forecast([10.0] * 72) for cell in cells})
    plan_trip(ORIGIN, DESTINATION, DEPART, 35_000, 10)
    plan_trip(ORIGIN, DESTINATION, DEPART, 35_000, 25)
    assert len(calls) == 1
