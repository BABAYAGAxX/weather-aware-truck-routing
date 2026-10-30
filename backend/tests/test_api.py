from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest
from rest_framework.test import APIClient

from trips import views
from trips.planner import IntervalTooFine
from trips.tomtom import RoutingError
from trips.weather import OutOfForecast, WeatherUnavailable


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def body():
    depart = datetime.now(timezone.utc) + timedelta(days=1)
    return {
        "origin": {"lat": 32.77, "lon": -96.79},
        "destination": {"lat": 33.74, "lon": -84.38},
        "depart_at": depart.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "load_lb": 35000,
        "interval": "auto",
    }


def test_good_request_calls_plan_trip_with_clean_values(client, body, monkeypatch):
    plan = Mock(return_value={"routes": []})
    monkeypatch.setattr(views, "plan_trip", plan)
    response = client.post("/api/plan", body, format="json")
    assert response.status_code == 200 and response.json() == {"routes": []}
    origin, destination, depart_at, load_lb, interval = plan.call_args.args
    assert origin == (32.77, -96.79) and destination == (33.74, -84.38)
    assert depart_at.tzinfo is not None and load_lb == 35000 and interval == "auto"


def test_a_departure_in_the_past_is_treated_as_now(client, body, monkeypatch):
    plan = Mock(return_value={})
    monkeypatch.setattr(views, "plan_trip", plan)
    body["depart_at"] = (datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    before = datetime.now(timezone.utc)
    client.post("/api/plan", body, format="json")
    assert plan.call_args.args[2] >= before


@pytest.mark.parametrize("change", [
    {"load_lb": 0}, {"load_lb": 80_001}, {"interval": 30},
    {"depart_at": "2020-01-01T00:00:00Z"}, {"depart_at": "2030-01-01T00:00:00Z"},
    {"destination": {"lat": 32.77, "lon": -96.79}},
    {"origin": {"lat": 91, "lon": -96.79}}, {"origin": {"lat": 32.77, "lon": -181}},
])
def test_bad_input_is_400_with_a_message(client, body, change):
    response = client.post("/api/plan", {**body, **change}, format="json")
    assert response.status_code == 400
    assert isinstance(response.json()["detail"], str) and response.json()["detail"]


@pytest.mark.parametrize("error, status", [
    (IntervalTooFine("x"), 400), (OutOfForecast("x"), 400),
    (RoutingError("x"), 502), (WeatherUnavailable("x"), 503),
])
def test_failures_become_readable_errors(client, body, monkeypatch, error, status):
    monkeypatch.setattr(views, "plan_trip", Mock(side_effect=error))
    response = client.post("/api/plan", body, format="json")
    assert response.status_code == status and response.json()["detail"] == "x"


def test_places_needs_two_characters(client, monkeypatch):
    search = Mock()
    monkeypatch.setattr(views, "search_places", search)
    assert client.get("/api/places?q=d").json() == []
    search.assert_not_called()


def test_places_returns_suggestions(client, monkeypatch):
    places = [{"label": "Dallas, TX", "lat": 32.77, "lon": -96.79}]
    monkeypatch.setattr(views, "search_places", Mock(return_value=places))
    assert client.get("/api/places?q=dall").json() == places


def test_places_routing_error_is_502(client, monkeypatch):
    monkeypatch.setattr(views, "search_places", Mock(side_effect=RoutingError("down")))
    response = client.get("/api/places?q=dall")
    assert response.status_code == 502 and response.json() == {"detail": "down"}
