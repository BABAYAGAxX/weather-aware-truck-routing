"""Two thin endpoints. Every failure leaves as {"detail": "..."}."""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from trips.planner import IntervalTooFine, plan_trip
from trips.serializers import PlanSerializer, first_problem
from trips.tomtom import RoutingError, search_places
from trips.weather import OutOfForecast, WeatherUnavailable


def _error(message, code):
    return Response({"detail": str(message)}, status=code)


@api_view(["GET"])
def places(request):
    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        return Response([])
    try:
        return Response(search_places(query))
    except RoutingError as error:
        return _error(error, status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
def plan(request):
    serializer = PlanSerializer(data=request.data)
    if not serializer.is_valid():
        return _error(first_problem(serializer.errors), status.HTTP_400_BAD_REQUEST)
    data = serializer.validated_data
    try:
        return Response(
            plan_trip(data["origin"], data["destination"], data["depart_at"], data["load_lb"], data["interval"])
        )
    except (IntervalTooFine, OutOfForecast) as error:
        return _error(error, status.HTTP_400_BAD_REQUEST)
    except RoutingError as error:
        return _error(error, status.HTTP_502_BAD_GATEWAY)
    except WeatherUnavailable as error:
        return _error(error, status.HTTP_503_SERVICE_UNAVAILABLE)
