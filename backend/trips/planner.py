"""The one function that ties routes, weather and rules together (steps 2 to 10 in docs/DESIGN.md)."""

from datetime import datetime, timedelta, timezone

from django.core.cache import cache

from trips.domain.geometry import (
    Point,
    corridor_cells,
    cumulative_lengths,
    elapsed_at,
    point_at_fraction,
    snap,
)
from trips.domain.ranking import (
    RouteRisk,
    checkpoint_miles,
    heat_cell_deg,
    is_recommended,
    rank_routes,
    recommendation_reason,
    resolve_interval,
    summarize_route,
)
from trips.domain.risk import checkpoint_cause, classify_checkpoint
from trips.tomtom import RouteData, fetch_routes
from trips.weather import Forecast, get_forecasts

MAX_LOCATIONS = 550
ROUTE_CACHE_SECONDS = 600
HEATMAP_HOURS = 49  # departure plus 0 to 48 whole hours
GEOMETRY_STEP = 5  # keep every 5th route point


class IntervalTooFine(Exception):
    """The search needs more weather locations than we allow. The message is safe to show."""


def _iso(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cached_routes(origin: Point, destination: Point, depart_at: datetime, load_lb: float):
    """TomTom routes, kept 10 minutes so changing only the interval needs no new call."""
    key = f"routes:{origin[0]}:{origin[1]}:{destination[0]}:{destination[1]}:{_iso(depart_at)}:{load_lb}"
    return cache.get_or_set(
        key, lambda: fetch_routes(origin, destination, depart_at, load_lb), ROUTE_CACHE_SECONDS
    )


def _stops(route: RouteData, depart_at: datetime, interval: int) -> list[tuple[float, Point, datetime]]:
    """Step 4: (mile, position, ETA) for each checkpoint on a route."""
    lengths = cumulative_lengths(route.points)  # km, only used to find positions
    return [
        (
            mile,
            point_at_fraction(route.points, lengths, mile / route.miles),
            depart_at + timedelta(seconds=elapsed_at(route.pairs, mile)),
        )
        for mile in checkpoint_miles(route.miles, interval)
    ]


def _checkpoint(stop: tuple[float, Point, datetime], forecasts: dict[Point, Forecast], load_lb: float) -> dict:
    """Step 8: the forecast hour nearest the ETA, classified."""
    mile, position, eta = stop
    weather = forecasts[snap(position)].weather_at(eta)
    return {
        "mile": round(mile, 1),
        "lat": round(position[0], 5),
        "lon": round(position[1], 5),
        "eta": _iso(eta),
        "wind_mph": round(weather.wind_mph, 2),
        "rain_in_hr": round(weather.rain_in_hr, 2),
        "snow_in_hr": round(weather.snow_in_hr, 2),
        "risk": int(classify_checkpoint(weather, load_lb)),
        "cause": checkpoint_cause(weather, load_lb),
    }


def _heat_cell(cell: Point, forecast: Forecast, depart_at: datetime, load_lb: float) -> dict:
    """Step 9: risk for each hour from departure."""
    return {
        "lat": cell[0],
        "lon": cell[1],
        "risk": [
            int(classify_checkpoint(forecast.weather_at(depart_at + timedelta(hours=hour)), load_lb))
            for hour in range(HEATMAP_HOURS)
        ],
    }


def _geometry(points: list[Point]) -> list[list[float]]:
    """Every 5th point and always the last, as [lon, lat]."""
    kept = points[::GEOMETRY_STEP]
    if kept[-1] != points[-1]:
        kept.append(points[-1])
    return [[round(lon, 5), round(lat, 5)] for lat, lon in kept]


def _route_result(route_id, route, stops, forecasts, depart_at, load_lb) -> tuple[dict, RouteRisk]:
    """Step 8 for one route: its checkpoints, then the summary used for ranking."""
    checkpoints = [_checkpoint(stop, forecasts, load_lb) for stop in stops]
    summary = summarize_route(
        route_id, route.duration_s, [stop[0] for stop in stops], [c["risk"] for c in checkpoints]
    )
    result = {
        "id": route_id,
        "miles": round(route.miles, 1),
        "duration_s": round(route.duration_s),
        "arrival": _iso(depart_at + timedelta(seconds=route.duration_s)),
        "no_travel_miles": round(summary.no_travel_miles, 1),
        "severe_miles": round(summary.severe_miles, 1),
        "high_miles": round(summary.high_miles, 1),
        "average_risk": round(summary.average_risk, 2),
        "geometry": _geometry(route.points),
        "checkpoints": checkpoints,
    }
    return result, summary


def plan_trip(
    origin: Point, destination: Point, depart_at: datetime, load_lb: float, interval: str | int
) -> dict:
    # Step 2: routes. Step 3: one interval for all of them.
    routes = _cached_routes(origin, destination, depart_at, load_lb)
    longest = max(route.miles for route in routes)
    interval_miles = resolve_interval(interval, longest)

    # Steps 4 and 5: checkpoint positions and heatmap squares.
    stops = [_stops(route, depart_at, interval_miles) for route in routes]
    cell_deg = heat_cell_deg(longest)
    cells = corridor_cells([route.points for route in routes], cell_deg)

    # Step 6: count unique locations before fetching, so the cache never changes the answer.
    locations = {snap(position) for route_stops in stops for _, position, _ in route_stops}
    locations |= cells
    if len(locations) > MAX_LOCATIONS:
        if interval == "auto" or interval_miles == 50:  # nothing wider to suggest
            raise IntervalTooFine("This trip is too long to check in one search.")
        raise IntervalTooFine(
            f"This trip needs {len(locations)} weather locations at {interval_miles} mile "
            f"spacing, and the limit is {MAX_LOCATIONS}. Please choose a wider interval."
        )

    # Steps 7 and 8: one weather call, then classify each route's checkpoints.
    forecasts = get_forecasts(locations)
    built = [
        _route_result(route_id, route, route_stops, forecasts, depart_at, load_lb)
        for route_id, route, route_stops in zip("ABC", routes, stops)
    ]

    # Step 10: rank. The route id stays with its route.
    by_id = {result["id"]: result for result, _ in built}
    ranked = rank_routes([summary for _, summary in built])

    return {
        "interval_miles": interval_miles,
        "routes": [
            {
                **by_id[summary.route_id],
                "recommended": index == 0 and is_recommended(ranked),
                "reason": recommendation_reason(ranked) if index == 0 else None,
            }
            for index, summary in enumerate(ranked)
        ],
        # Step 9: every square, hours 0 to 48 after departure.
        "heatmap": {
            "cell_deg": cell_deg,
            "cells": [_heat_cell(cell, forecasts[cell], depart_at, load_lb) for cell in sorted(cells)],
        },
    }
