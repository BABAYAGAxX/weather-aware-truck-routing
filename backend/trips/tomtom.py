"""TomTom truck routing and address search. One of two files that call an outside service."""

from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from django.conf import settings

from trips.domain.geometry import Point

BASE_URL = "https://api.tomtom.com"
SEARCH_TIMEOUT_S = 15
ROUTING_TIMEOUT_S = 30  # long trips took up to 19 s in testing
METERS_PER_MILE = 1609.34
LB_PER_KG = 2.20462
TRUCK_LB = 35_000  # empty tractor and trailer, added to the load
LEGAL_LIMIT_LB = 80_000


class RoutingError(Exception):
    """TomTom could not give us routes or places. The message is safe to show the user."""


@dataclass
class RouteData:
    points: list[Point]
    miles: float
    duration_s: float
    pairs: list[tuple[float, float]]  # (miles, elapsed seconds), sorted by miles


def vehicle_weight_kg(load_lb: float) -> int:
    """Load plus the truck itself, capped at the legal limit, in kilograms."""
    return round(min(load_lb + TRUCK_LB, LEGAL_LIMIT_LB) / LB_PER_KG)


def _get_json(path: str, params: dict, bad_request_message: str, timeout: int) -> dict:
    """GET from TomTom. Errors are raised outside the except block so the URL, which
    holds the API key, never ends up in an exception chain."""
    message = None
    try:
        response = httpx.get(
            BASE_URL + path, params={**params, "key": settings.TOMTOM_API_KEY}, timeout=timeout
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 400:
            message = bad_request_message
        else:
            message = "TomTom returned an error. Please try again."
    except (httpx.HTTPError, ValueError):
        message = "Could not reach TomTom. Please try again."
    raise RoutingError(message) from None


def parse_routes(payload: dict) -> list[RouteData]:
    """Turn a TomTom calculateRoute response into plain route data."""
    routes = []
    for route in payload.get("routes", []):
        miles = route["summary"]["lengthInMeters"] / METERS_PER_MILE
        duration_s = route["summary"]["travelTimeInSeconds"]
        points = [
            (p["latitude"], p["longitude"]) for leg in route["legs"] for p in leg["points"]
        ]
        # Keyed by distance so a repeated distance keeps only its first entry.
        elapsed_at = {0.0: 0}
        for step in route["guidance"]["instructions"]:
            step_miles = step["routeOffsetInMeters"] / METERS_PER_MILE
            if step_miles < miles:
                elapsed_at.setdefault(step_miles, step["travelTimeInSeconds"])
        elapsed_at[miles] = duration_s
        routes.append(RouteData(points, miles, duration_s, sorted(elapsed_at.items())))
    return routes


def fetch_routes(
    origin: Point, destination: Point, depart_at: datetime, load_lb: float
) -> list[RouteData]:
    """Up to three truck routes (fastest plus alternatives) for this vehicle."""
    depart = depart_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    locations = f"{origin[0]},{origin[1]}:{destination[0]},{destination[1]}"
    payload = _get_json(
        f"/routing/1/calculateRoute/{locations}/json",
        {
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "vehicleWeight": vehicle_weight_kg(load_lb),
            "maxAlternatives": 2,
            "routeType": "fastest",
            "instructionsType": "coded",
            "departAt": depart,
        },
        "No truck route found between these places.",
        ROUTING_TIMEOUT_S,
    )
    routes = parse_routes(payload)
    if not routes:
        raise RoutingError("No truck route found between these places.")
    return routes


def search_places(query: str) -> list[dict]:
    """US address suggestions as {label, lat, lon}."""
    payload = _get_json(
        f"/search/2/search/{quote(query, safe='')}.json",
        {"typeahead": "true", "countrySet": "US", "limit": 5, "idxSet": "Geo,Str"},
        "Address search failed. Please try a different search.",
        SEARCH_TIMEOUT_S,
    )
    return [
        {
            "label": result["address"]["freeformAddress"],
            "lat": result["position"]["lat"],
            "lon": result["position"]["lon"],
        }
        for result in payload.get("results", [])
    ]
