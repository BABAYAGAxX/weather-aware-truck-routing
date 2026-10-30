import pytest

from trips.domain.risk import (
    RiskLevel as R,
    Weather,
    apply_load_rules,
    checkpoint_cause,
    classify_checkpoint,
    classify_rain,
    classify_snow,
    classify_wind,
)


@pytest.mark.parametrize(
    "mph, expected",
    [
        (0, R.LOW), (24.9, R.LOW),
        (25, R.MODERATE), (34.6, R.MODERATE),
        (35, R.HIGH), (44.9, R.HIGH),
        (45, R.SEVERE), (54.9, R.SEVERE),
        (55, R.NO_TRAVEL), (90, R.NO_TRAVEL),
    ],
)
def test_wind_bands(mph, expected):
    assert classify_wind(mph) == expected


@pytest.mark.parametrize(
    "in_hr, expected",
    [
        (0, R.LOW), (0.09, R.LOW),
        (0.10, R.MODERATE), (0.24, R.MODERATE),
        (0.25, R.HIGH), (0.49, R.HIGH),
        (0.50, R.SEVERE), (1.00, R.SEVERE),
        (1.01, R.NO_TRAVEL),
    ],
)
def test_rain_bands(in_hr, expected):
    assert classify_rain(in_hr) == expected


@pytest.mark.parametrize(
    "in_hr, expected",
    [
        (0, R.LOW), (0.49, R.LOW),
        (0.5, R.MODERATE), (0.99, R.MODERATE),
        (1.0, R.HIGH), (1.99, R.HIGH),
        (2.0, R.SEVERE), (3.0, R.SEVERE),
        (3.01, R.NO_TRAVEL),
    ],
)
def test_snow_bands(in_hr, expected):
    assert classify_snow(in_hr) == expected


@pytest.mark.parametrize(
    "wind_level, load, expected",
    [
        (R.SEVERE, 30_000, R.SEVERE),
        (R.SEVERE, 30_001, R.NO_TRAVEL),
        (R.HIGH, 40_000, R.HIGH),
        (R.HIGH, 40_001, R.SEVERE),
        (R.HIGH, 30_001, R.HIGH),
        (R.MODERATE, 80_000, R.MODERATE),
        (R.NO_TRAVEL, 0, R.NO_TRAVEL),
    ],
)
def test_load_rules(wind_level, load, expected):
    assert apply_load_rules(wind_level, load) == expected


def test_checkpoint_takes_worst_condition():
    assert classify_checkpoint(Weather(10, 0.6, 0), 10_000) == R.SEVERE
    assert classify_checkpoint(Weather(30, 0, 1.5), 10_000) == R.HIGH


def test_load_rule_outranks_milder_precipitation():
    assert classify_checkpoint(Weather(50, 0.3, 0), 35_000) == R.NO_TRAVEL


def test_load_never_lowers_level():
    assert classify_checkpoint(Weather(10, 1.5, 0), 0) == R.NO_TRAVEL


def test_cause_names_load_when_load_raised_the_level():
    assert checkpoint_cause(Weather(50, 0, 0), 35_000) == "wind+load"
    assert checkpoint_cause(Weather(50, 0, 0), 10_000) == "wind"


def test_cause_is_worst_condition_and_none_when_low():
    assert checkpoint_cause(Weather(10, 0.6, 0), 0) == "rain"
    assert checkpoint_cause(Weather(10, 0, 2.5), 0) == "snow"
    assert checkpoint_cause(Weather(10, 0, 0), 0) is None
