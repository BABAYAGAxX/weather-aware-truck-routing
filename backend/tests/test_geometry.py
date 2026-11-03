import pytest

from trips.domain.geometry import (
    corridor_cells,
    cumulative_lengths,
    elapsed_at,
    heat_cell,
    point_at_fraction,
    snap,
)


def test_point_at_fraction_stays_on_route():
    points = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]
    lengths = cumulative_lengths(points)
    assert point_at_fraction(points, lengths, 0.25) == pytest.approx((0.0, 0.5))
    assert point_at_fraction(points, lengths, 1.0) == (0.0, 2.0)


def test_elapsed_is_a_straight_line_between_known_pairs():
    assert elapsed_at([(0, 0), (100, 50), (300, 250)], 200) == 150
    assert elapsed_at([(0, 0), (100, 50)], 100) == 50


def test_snap_aligns_to_absolute_grid():
    assert snap((32.77, -96.79)) == (32.8, -96.8)


def test_corridor_is_route_cells_plus_one_ring():
    assert len(corridor_cells([[(10.0, 10.0)]], 1.0)) == 9


@pytest.mark.parametrize("cell_deg", [0.25, 0.5, 1.0, 2.0])
def test_heat_cell_matches_the_corridor_squares(cell_deg):
    point = (32.77798, -96.79622)
    assert heat_cell(point, cell_deg) in corridor_cells([[point]], cell_deg)
