"""Checkpoint spacing and route ranking. Rules are documented in docs/DECISIONS.md."""

from collections.abc import Sequence
from dataclasses import dataclass

from .risk import RiskLevel

INTERVALS_MILES = (10, 25, 50)
AUTO_10_MI_BELOW = 250
AUTO_25_MI_UP_TO = 750


def auto_interval(longest_route_miles: float) -> int:
    if longest_route_miles < AUTO_10_MI_BELOW:
        return 10
    if longest_route_miles <= AUTO_25_MI_UP_TO:
        return 25
    return 50


def checkpoint_miles(route_miles: float, interval: int) -> list[float]:
    """Mile 0, every interval along the route, and the destination."""
    miles = [float(mile) for mile in range(0, int(route_miles) + 1, interval)]
    if miles[-1] < route_miles:
        miles.append(route_miles)
    return miles


def covered_miles(miles: Sequence[float]) -> list[float]:
    """Miles each checkpoint covers, split at the midpoints between checkpoints."""
    if len(miles) == 1:
        return [0.0]
    edges = [miles[0], *((a + b) / 2 for a, b in zip(miles, miles[1:])), miles[-1]]
    return [end - start for start, end in zip(edges, edges[1:])]


@dataclass(frozen=True)
class RouteRisk:
    route_id: str
    duration_s: float
    no_travel_miles: float
    severe_miles: float
    high_miles: float
    average_risk: float


def summarize_route(
    route_id: str,
    duration_s: float,
    miles: Sequence[float],
    levels: Sequence[RiskLevel],
) -> RouteRisk:
    covered = covered_miles(miles)
    total = sum(covered)

    def miles_at(level: RiskLevel) -> float:
        return sum(mi for mi, lvl in zip(covered, levels) if lvl == level)

    return RouteRisk(
        route_id=route_id,
        duration_s=duration_s,
        no_travel_miles=miles_at(RiskLevel.NO_TRAVEL),
        severe_miles=miles_at(RiskLevel.SEVERE),
        high_miles=miles_at(RiskLevel.HIGH),
        average_risk=(
            sum(mi * lvl for mi, lvl in zip(covered, levels)) / total if total else 0.0
        ),
    )


def _rank_key(route: RouteRisk) -> tuple[float, ...]:
    return (
        round(route.no_travel_miles, 1),
        round(route.severe_miles, 1),
        round(route.high_miles, 1),
        round(route.average_risk, 2),
        route.duration_s,
    )


def rank_routes(routes: Sequence[RouteRisk]) -> list[RouteRisk]:
    """Best route first."""
    return sorted(routes, key=_rank_key)
