from datetime import datetime, timezone

import httpx
import pytest
from django.core.cache import cache

from trips import weather
from trips.weather import Forecast, OutOfForecast, WeatherUnavailable, get_forecasts

UTC = timezone.utc


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@pytest.fixture
def httpx_429(monkeypatch):
    request = httpx.Request("POST", weather.URL)
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: httpx.Response(429, request=request))


def forecast(hours=3):
    return Forecast(datetime(2026, 10, 30, tzinfo=UTC), [10.0] * hours, [0.0] * hours, [0.0] * hours)


def test_weather_at_uses_nearest_hour():
    f = forecast()
    f.wind[1] = 40.0
    assert f.weather_at(datetime(2026, 10, 30, 1, 29, tzinfo=UTC)).wind_mph == 40.0
    assert f.weather_at(datetime(2026, 10, 30, 1, 31, tzinfo=UTC)).wind_mph == 10.0


def test_weather_at_sends_half_hours_up_so_consecutive_times_read_consecutive_hours():
    f = forecast(hours=4)
    f.wind = [0.0, 1.0, 2.0, 3.0]
    assert f.weather_at(datetime(2026, 10, 30, 0, 30, tzinfo=UTC)).wind_mph == 1.0
    assert f.weather_at(datetime(2026, 10, 30, 1, 30, tzinfo=UTC)).wind_mph == 2.0


def test_weather_at_outside_forecast_raises():
    with pytest.raises(OutOfForecast):
        forecast().weather_at(datetime(2026, 11, 2, tzinfo=UTC))
    with pytest.raises(OutOfForecast):
        forecast().weather_at(datetime(2026, 10, 29, tzinfo=UTC))


def test_get_forecasts_only_requests_uncached_cells(monkeypatch):
    calls = []
    monkeypatch.setattr(weather, "_fetch", lambda cells: calls.append(cells) or {c: forecast() for c in cells})
    get_forecasts([(1.0, 1.0)])
    get_forecasts([(1.0, 1.0), (2.0, 2.0)])
    assert calls == [[(1.0, 1.0)], [(2.0, 2.0)]]


def test_get_forecasts_skips_the_call_when_everything_is_cached(monkeypatch):
    calls = []
    monkeypatch.setattr(weather, "_fetch", lambda cells: calls.append(cells) or {c: forecast() for c in cells})
    get_forecasts([(1.0, 1.0)])
    assert get_forecasts([(1.0, 1.0)]).keys() == {(1.0, 1.0)}
    assert len(calls) == 1


def test_rate_limit_raises_weather_unavailable(httpx_429):
    with pytest.raises(WeatherUnavailable, match="try again in a minute"):
        weather._fetch([(1.0, 1.0)])


def _location(start, rain, showers):
    """One location's block of an Open-Meteo response, two hours long."""
    return {"hourly": {"time": [start, start + 3600], "wind_speed_10m": [5.0, 6.0],
                       "rain": rain, "showers": showers,
                       "snowfall": [0.0, 0.5]}}


@pytest.mark.parametrize("wrap", [lambda blocks: blocks, lambda blocks: blocks[0]])
def test_fetch_reads_a_list_or_a_single_object(monkeypatch, wrap):
    blocks = [_location(1_793_318_400, [0.1, 0.0], [0.2, 0.0])]
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: httpx.Response(
        200, json=wrap(blocks), request=httpx.Request("POST", weather.URL)))
    result = weather._fetch([(1.0, 1.0)])[(1.0, 1.0)]
    assert result.start == datetime.fromtimestamp(1_793_318_400, UTC)
    assert result.start.tzinfo is not None
    assert result.rain == pytest.approx([0.3, 0.0])  # rain plus showers
    assert result.weather_at(result.start).wind_mph == 5.0


def test_rain_plus_showers_is_rounded_so_a_band_edge_is_not_missed(monkeypatch):
    blocks = [_location(1_793_318_400, [0.01, 0.0], [0.09, 0.0])]
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: httpx.Response(
        200, json=blocks, request=httpx.Request("POST", weather.URL)))
    result = weather._fetch([(1.0, 1.0)])[(1.0, 1.0)]
    assert result.rain[0] == 0.1  # exact, so classify_rain reads Moderate


def test_fetch_rejects_a_malformed_response(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: httpx.Response(
        200, json={"unexpected": 1}, request=httpx.Request("POST", weather.URL)))
    with pytest.raises(WeatherUnavailable):
        weather._fetch([(1.0, 1.0)])
