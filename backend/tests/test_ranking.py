import pytest

from trips.domain.ranking import (
    RouteRisk,
    auto_interval,
    checkpoint_miles,
    covered_miles,
    heat_cell_deg,
    is_recommended,
    rank_routes,
    recommendation_reason,
    resolve_interval,
    summarize_route,
)
from trips.domain.risk import RiskLevel as R


def route(route_id, duration=3600, no_travel=0, severe=0, high=0, average=0):
    return RouteRisk(route_id, duration, no_travel, severe, high, average)


def ids(routes):
    return [r.route_id for r in rank_routes(routes)]


@pytest.mark.parametrize(
    "miles, expected",
    [(0, 10), (249.9, 10), (250, 25), (750, 25), (750.1, 50), (3000, 50)],
)
def test_auto_interval(miles, expected):
    assert auto_interval(miles) == expected


def test_checkpoints_include_origin_and_destination():
    assert checkpoint_miles(60, 25) == [0, 25, 50, 60]


def test_checkpoints_do_not_duplicate_exact_multiple():
    assert checkpoint_miles(50, 25) == [0, 25, 50]


def test_route_shorter_than_interval():
    assert checkpoint_miles(7.5, 10) == [0, 7.5]


def test_covered_miles_split_at_midpoints():
    assert covered_miles([0, 25, 50, 60]) == [12.5, 25, 17.5, 5]
    assert covered_miles([0.0]) == [0.0]


def test_covered_miles_add_up_to_route_length():
    assert sum(covered_miles(checkpoint_miles(786.4, 25))) == pytest.approx(786.4)


def test_summary_counts_miles_and_weights_average_by_miles():
    summary = summarize_route("a", 100, [0, 10, 20], [R.LOW, R.SEVERE, R.NO_TRAVEL])
    assert summary.severe_miles == 10
    assert summary.no_travel_miles == 5
    assert summary.high_miles == 0
    assert summary.average_risk == pytest.approx((0 * 5 + 3 * 10 + 4 * 5) / 20)


def test_no_travel_ranks_ahead_of_severe():
    assert ids([route("a", no_travel=1), route("b", severe=500)]) == ["b", "a"]


def test_severe_ranks_ahead_of_high():
    assert ids([route("a", severe=1), route("b", high=500)]) == ["b", "a"]


def test_high_ranks_ahead_of_average():
    assert ids([route("a", high=1), route("b", average=3)]) == ["b", "a"]


def test_average_ranks_ahead_of_time():
    assert ids([route("a", average=2, duration=1), route("b", average=1, duration=99)]) == ["b", "a"]


def test_time_breaks_final_tie():
    assert ids([route("a", duration=200), route("b", duration=100)]) == ["b", "a"]


def test_float_noise_falls_through_to_next_rule():
    noisy = route("a", severe=10.00000001, duration=100)
    clean = route("b", severe=10.0, duration=200)
    assert ids([clean, noisy]) == ["a", "b"]


def test_cell_size_follows_trip_length():
    assert [heat_cell_deg(m) for m in (100, 500, 900)] == [0.25, 0.5, 1.0]


def test_cell_size_has_a_band_for_very_long_trips():
    assert [heat_cell_deg(m) for m in (1500, 1500.1, 3400)] == [1.0, 2.0, 2.0]


def test_resolve_interval():
    assert resolve_interval("auto", 500) == 25
    assert resolve_interval(10, 500) == 10


def test_no_recommendation_when_best_route_has_no_travel():
    assert is_recommended([route("a", no_travel=1), route("b", no_travel=5)]) is False
    assert is_recommended([route("a", severe=9)]) is True


def test_reason_names_deciding_rule_and_extra_time():
    ranked = rank_routes([route("a", high=12.5, duration=4200), route("b", high=38, duration=2640)])
    assert recommendation_reason(ranked) == "Fewest High miles (12.5 vs 38.0). 26 min slower than the fastest route."


def test_reason_has_no_extra_time_when_winner_is_fastest():
    ranked = rank_routes([route("a", severe=2, duration=100), route("b", severe=8, duration=200)])
    assert recommendation_reason(ranked) == "Fewest Severe miles (2.0 vs 8.0)."


def test_reason_compares_with_the_fastest_route_when_it_is_not_the_winner():
    ranked = rank_routes(
        [
            route("a", average=0.00, duration=600 * 60),
            route("b", average=0.00, duration=700 * 60),
            route("c", average=0.01, duration=418 * 60),
        ]
    )
    assert (
        recommendation_reason(ranked)
        == "Lowest average risk (0.00 vs 0.01). 182 min slower than the fastest route."
    )


def test_reason_when_tied_on_risk():
    ranked = rank_routes([route("a", duration=100), route("b", duration=200)])
    assert recommendation_reason(ranked) == "Equal risk, shortest travel time."


def test_reason_with_one_route():
    assert recommendation_reason([route("a")]) == "Only route found."
