"""Check what the browser sends before any paid API is called."""

from datetime import datetime, timedelta, timezone

from rest_framework import serializers

MAX_DEPARTURE_DAYS = 10
MAX_LOAD_LB = 80_000
INTERVALS = ["auto", 10, 25, 50]


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)

    def validate(self, attrs):
        return (attrs["lat"], attrs["lon"])  # the planner wants a (lat, lon) tuple


class PlanSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    depart_at = serializers.DateTimeField(default_timezone=timezone.utc)
    load_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)
    interval = serializers.ChoiceField(choices=INTERVALS)

    def validate_depart_at(self, value: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        if value < now - timedelta(hours=1):
            raise serializers.ValidationError("Can be at most 1 hour in the past.")
        if value > now + timedelta(days=MAX_DEPARTURE_DAYS):
            raise serializers.ValidationError(f"Can be at most {MAX_DEPARTURE_DAYS} days ahead.")
        # A fresh forecast starts at 00:00 UTC today, so an old time just after midnight would fall before it.
        return max(value, now)

    def validate(self, attrs):
        if attrs["origin"] == attrs["destination"]:
            raise serializers.ValidationError("Origin and destination must be different.")
        return attrs


def first_problem(errors) -> str:
    """One plain sentence for the first error in DRF's nested error format."""
    names = []
    while not isinstance(errors, str):
        if isinstance(errors, dict):
            name, errors = next(iter(errors.items()))
            if name != "non_field_errors":
                names.append(name)
        else:
            errors = errors[0]
    return f"{' '.join(names)}: {errors}" if names else str(errors)
