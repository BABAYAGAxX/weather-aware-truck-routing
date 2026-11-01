"""Pure route geometry: distance along a route, position at a mile, heatmap squares."""

from bisect import bisect_left
from collections.abc import Sequence
from math import asin, cos, radians, sin, sqrt

Point = tuple[float, float]  # (lat, lon)

EARTH_RADIUS_KM = 6371.0


def haversine_km(a: Point, b: Point) -> float:
    """Great-circle distance between two points."""
    lat1, lon1, lat2, lon2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


def cumulative_lengths(points: Sequence[Point]) -> list[float]:
    """Running distance (km) at each point, starting at 0."""
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + haversine_km(a, b))
    return lengths


def point_at_fraction(points: Sequence[Point], lengths: Sequence[float], fraction: float) -> Point:
    """Point a fraction (0 to 1) of the way along the route, by summed length."""
    target = min(max(fraction, 0.0), 1.0) * lengths[-1]
    i = bisect_left(lengths, target)
    if i == 0:
        return points[0]
    t = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1])
    (lat1, lon1), (lat2, lon2) = points[i - 1], points[i]
    return (lat1 * (1 - t) + lat2 * t, lon1 * (1 - t) + lon2 * t)


def elapsed_at(pairs: Sequence[tuple[float, float]], distance: float) -> float:
    """Elapsed time at a distance, a straight line between known (distance, elapsed) pairs.

    Pairs are sorted with distinct distances. Outside them the nearest end is used.
    """
    i = bisect_left([d for d, _ in pairs], distance)
    if i == 0:
        return pairs[0][1]
    if i == len(pairs):
        return pairs[-1][1]
    (d1, e1), (d2, e2) = pairs[i - 1], pairs[i]
    return e1 + (distance - d1) / (d2 - d1) * (e2 - e1)


def snap(point: Point) -> Point:
    """The 0.1 degree square a point falls in, so nearby checkpoints share one forecast."""
    lat, lon = point
    return (round(lat, 1), round(lon, 1))


def corridor_cells(routes: Sequence[Sequence[Point]], cell_deg: float) -> set[Point]:
    """Grid squares the routes pass through, plus one ring of squares around them."""
    on_route = {(round(lat / cell_deg), round(lon / cell_deg)) for route in routes for lat, lon in route}
    cells = {(i + di, j + dj) for i, j in on_route for di in (-1, 0, 1) for dj in (-1, 0, 1)}
    return {(round(i * cell_deg, 2), round(j * cell_deg, 2)) for i, j in cells}
