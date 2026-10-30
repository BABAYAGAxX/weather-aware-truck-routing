"""Weather risk classification. Rules are documented in docs/DECISIONS.md."""

from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


# Lower bound of Moderate, High and Severe. A value on a bound takes the higher band.
WIND_BOUNDS = (25, 35, 45)
RAIN_BOUNDS = (0.10, 0.25, 0.50)
SNOW_BOUNDS = (0.5, 1.0, 2.0)

WIND_NO_TRAVEL_MPH = 55  # inclusive
RAIN_NO_TRAVEL_IN_HR = 1.00  # exclusive
SNOW_NO_TRAVEL_IN_HR = 3.0  # exclusive

SEVERE_WIND_NO_TRAVEL_LOAD_LB = 30_000  # exclusive
HIGH_WIND_SEVERE_LOAD_LB = 40_000  # exclusive


def _band(value: float, bounds: tuple[float, float, float]) -> RiskLevel:
    level = RiskLevel.LOW
    for bound in bounds:
        if value >= bound:
            level = RiskLevel(level + 1)
    return level


def classify_wind(mph: float) -> RiskLevel:
    if mph >= WIND_NO_TRAVEL_MPH:
        return RiskLevel.NO_TRAVEL
    return _band(mph, WIND_BOUNDS)


def classify_rain(in_hr: float) -> RiskLevel:
    if in_hr > RAIN_NO_TRAVEL_IN_HR:
        return RiskLevel.NO_TRAVEL
    return _band(in_hr, RAIN_BOUNDS)


def classify_snow(in_hr: float) -> RiskLevel:
    if in_hr > SNOW_NO_TRAVEL_IN_HR:
        return RiskLevel.NO_TRAVEL
    return _band(in_hr, SNOW_BOUNDS)


def apply_load_rules(wind_level: RiskLevel, load_lb: float) -> RiskLevel:
    if wind_level == RiskLevel.SEVERE and load_lb > SEVERE_WIND_NO_TRAVEL_LOAD_LB:
        return RiskLevel.NO_TRAVEL
    if wind_level == RiskLevel.HIGH and load_lb > HIGH_WIND_SEVERE_LOAD_LB:
        return RiskLevel.SEVERE
    return wind_level


def classify_checkpoint(weather: Weather, load_lb: float) -> RiskLevel:
    return max(
        apply_load_rules(classify_wind(weather.wind_mph), load_lb),
        classify_rain(weather.rain_in_hr),
        classify_snow(weather.snow_in_hr),
    )
