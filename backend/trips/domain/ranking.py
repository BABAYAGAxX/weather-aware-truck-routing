"""Checkpoint spacing and route ranking. Rules are documented in docs/DECISIONS.md."""

from collections.abc import Sequence
from dataclasses import dataclass

from .risk import RiskLevel

AUTO_10_MI_BELOW = 250
AUTO_25_MI_UP_TO = 750


def auto_interval(longest_route_miles: float) -> int:
    if longest_route_miles < AUTO_10_MI_BELOW:
        return 10
    if longest_route_miles <= AUTO_25_MI_UP_TO:
        return 25
    return 50


def resolve_interval(choice: str | int, longest_miles: float) -> int:
    return auto_interval(longest_miles) if choice == "auto" else int(choice)


HEAT_CELL_DEG = {10: 0.25, 25: 0.5, 50: 1.0}
VERY_LONG_TRIP_MILES = 1500
VERY_LONG_TRIP_CELL_DEG = 2.0


def heat_cell_deg(longest_miles: float) -> float:
    """Heatmap square size: the Auto bands, plus larger squares over 1,500 mi."""
    if longest_miles > VERY_LONG_TRIP_MILES:
        return VERY_LONG_TRIP_CELL_DEG
    return HEAT_CELL_DEG[auto_interval(longest_miles)]


def checkpoint_miles(route_miles: float, interval: int) -> list[float]:
    """Mile 0, every interval along the route, and the destination."""
    miles = [float(mile) for mile in range(0, int(route_miles) + 1, interval)]
    if miles[-1] < route_miles:
        miles.append(route_miles)
    return miles


def covered_miles(miles: Sequence[float]) -> list[float]:
    """Miles each checkpoint covers, split at the midpoints between checkpoints.

    Example: [0, 50, 80] -> [25, 40, 15]
    """
    midpoints = [(a + b) / 2 for a, b in zip(miles, miles[1:])]
    edges = [miles[0], *midpoints, miles[-1]]
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
    # Rounding ignores float noise, so a meaningless difference falls to the next rule.
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


def is_recommended(ranked: Sequence[RouteRisk]) -> bool:
    """False when even the best route has No Travel miles."""
    return round(ranked[0].no_travel_miles, 1) == 0


# (sentence start, RouteRisk field, decimals), in rank order.
_RISK_RULES = (
    ("Fewest No Travel miles", "no_travel_miles", 1),
    ("Fewest Severe miles", "severe_miles", 1),
    ("Fewest High miles", "high_miles", 1),
    ("Lowest average risk", "average_risk", 2),
)


def recommendation_reason(ranked: Sequence[RouteRisk]) -> str:
    """Which rule put the best route ahead of the fastest route (or the runner-up, if
    the best is the fastest), and its extra time against the fastest route."""
    if len(ranked) == 1:
        return "Only route found."
    best = ranked[0]
    fastest = min(ranked, key=lambda r: r.duration_s)
    other = ranked[1] if fastest is best else fastest
    reason = "Equal risk, shortest travel time."
    for label, field, digits in _RISK_RULES:
        a = round(getattr(best, field), digits)
        b = round(getattr(other, field), digits)
        if a != b:
            reason = f"{label} ({a:,.{digits}f} vs {b:,.{digits}f})."
            break
    slower = round((best.duration_s - fastest.duration_s) / 60)
    if slower > 0:
        reason += f" {slower} min slower than the fastest route."
    return reason
