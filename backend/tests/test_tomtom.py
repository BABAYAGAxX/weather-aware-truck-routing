from datetime import datetime, timezone

import httpx
import pytest

from trips.tomtom import RoutingError, fetch_routes, parse_routes, search_places, vehicle_weight_kg


def test_parse_adds_start_and_end_and_drops_duplicate_offsets():
    payload = {"routes": [{
        "summary": {"lengthInMeters": 1609.34, "travelTimeInSeconds": 60},
        "legs": [{"points": [{"latitude": 1.0, "longitude": 2.0}, {"latitude": 1.1, "longitude": 2.1}]}],
        "guidance": {"instructions": [
            {"routeOffsetInMeters": 0, "travelTimeInSeconds": 0},
            {"routeOffsetInMeters": 804.67, "travelTimeInSeconds": 20},
            {"routeOffsetInMeters": 804.67, "travelTimeInSeconds": 20},
        ]},
    }]}
    route = parse_routes(payload)[0]
    assert route.miles == pytest.approx(1.0)
    assert route.pairs == [(0, 0), (pytest.approx(0.5), 20), (pytest.approx(1.0), 60)]


def test_vehicle_weight_adds_truck_and_caps_at_legal_limit():
    assert vehicle_weight_kg(10_000) == round(45_000 / 2.20462)
    assert vehicle_weight_kg(60_000) == round(80_000 / 2.20462)


def _fake_get(monkeypatch, status, body=None):
    """Replace httpx.get with a canned response. Returns the list of calls made."""
    calls = []

    def fake(url, params, timeout):
        calls.append(params)
        return httpx.Response(status, json=body or {}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake)
    return calls


@pytest.mark.parametrize("status", [400, 500])
def test_http_failure_raises_routing_error_without_the_key(monkeypatch, settings, status):
    settings.TOMTOM_API_KEY = "secret-key"
    _fake_get(monkeypatch, status)
    with pytest.raises(RoutingError) as info:
        fetch_routes((1, 2), (3, 4), datetime.now(timezone.utc), 10_000)
    assert "secret-key" not in str(info.value)
    assert info.value.__context__ is None


def test_empty_routes_raises_routing_error(monkeypatch):
    _fake_get(monkeypatch, 200, {"routes": []})
    with pytest.raises(RoutingError):
        fetch_routes((1, 2), (3, 4), datetime.now(timezone.utc), 10_000)


def test_departure_is_sent_unchanged_as_utc_with_z(monkeypatch):
    calls = _fake_get(monkeypatch, 200, {"routes": []})
    past = datetime(2020, 5, 6, 7, 8, 9, tzinfo=timezone.utc)
    future = datetime(2099, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    for when in (past, future):
        with pytest.raises(RoutingError):
            fetch_routes((1, 2), (3, 4), when, 10_000)
    assert [c["departAt"] for c in calls] == ["2020-05-06T07:08:09Z", "2099-01-02T03:04:05Z"]


def test_search_places_maps_results(monkeypatch):
    _fake_get(monkeypatch, 200, {"results": [
        {"address": {"freeformAddress": "Dallas, TX"}, "position": {"lat": 32.7, "lon": -96.8}},
    ]})
    assert search_places("dal") == [{"label": "Dallas, TX", "lat": 32.7, "lon": -96.8}]
