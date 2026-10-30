"""Open-Meteo hourly forecasts, cached per square. The other file that calls an outside service."""

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from django.core.cache import cache

from trips.domain.geometry import Point
from trips.domain.risk import Weather

URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_S = 10
FORECAST_DAYS = 14
CACHE_SECONDS = 30 * 60


class WeatherUnavailable(Exception):
    """Open-Meteo could not give us a forecast. The message is safe to show the user."""


class OutOfForecast(Exception):
    """The requested time is before or after the hours we have a forecast for."""


@dataclass
class Forecast:
    start: datetime  # UTC time of the first hour. Each square keeps its own.
    wind: list[float]  # mph
    rain: list[float]  # inches per hour, rain plus showers
    snow: list[float]  # inches per hour

    def weather_at(self, when: datetime) -> Weather:
        """Weather for the hour nearest to `when`. Exactly halfway goes to the later hour."""
        # Not round(): it sends ties to the even number, so hours 0.5, 1.5, 2.5 would read 0, 2, 2.
        hour = math.floor((when - self.start).total_seconds() / 3600 + 0.5)
        if not 0 <= hour < len(self.wind):
            raise OutOfForecast("That time is outside the 14 day forecast.")
        return Weather(self.wind[hour], self.rain[hour], self.snow[hour])


def _fetch(cells: list[Point]) -> dict[Point, Forecast]:
    """One Open-Meteo request for all the cells. The only function that uses the network."""
    form = {
        "latitude": ",".join(str(lat) for lat, _ in cells),
        "longitude": ",".join(str(lon) for _, lon in cells),
        "hourly": "wind_speed_10m,rain,showers,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "timeformat": "unixtime",
        "forecast_days": FORECAST_DAYS,
    }
    message = None
    try:
        response = httpx.post(URL, data=form, timeout=TIMEOUT_S)
        response.raise_for_status()
        blocks = response.json()
        if isinstance(blocks, dict):  # one location comes back as an object, not a list
            blocks = [blocks]
        if len(blocks) != len(cells):
            raise ValueError("wrong number of locations")
        return {cell: _parse(block["hourly"]) for cell, block in zip(cells, blocks)}
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            message = "The weather service is busy. Please try again in a minute."
        else:
            message = "The weather service returned an error. Please try again."
    except httpx.HTTPError:
        message = "Could not reach the weather service. Please try again."
    except (ValueError, KeyError, TypeError):
        message = "The weather service sent a response we could not read. Please try again."
    raise WeatherUnavailable(message) from None


def _parse(hourly: dict) -> Forecast:
    return Forecast(
        start=datetime.fromtimestamp(hourly["time"][0], timezone.utc),
        wind=hourly["wind_speed_10m"],
        rain=[round(rain + showers, 3) for rain, showers in zip(hourly["rain"], hourly["showers"])],
        snow=hourly["snowfall"],
    )


def get_forecasts(cells: Iterable[Point]) -> dict[Point, Forecast]:
    """Forecast for each cell. Only cells missing from the cache are fetched."""
    keys = {cell: f"wx:{cell[0]}:{cell[1]}" for cell in cells}
    cached = cache.get_many(keys.values())
    forecasts = {cell: cached[key] for cell, key in keys.items() if key in cached}
    missing = [cell for cell in keys if cell not in forecasts]
    if missing:
        fetched = _fetch(missing)
        cache.set_many({keys[cell]: forecast for cell, forecast in fetched.items()}, CACHE_SECONDS)
        forecasts.update(fetched)
    return forecasts
