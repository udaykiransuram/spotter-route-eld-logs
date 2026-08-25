from __future__ import annotations

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.exceptions import ApiError
from trips.providers.base import ProviderError
from trips.scheduler import SchedulingError
from trips.serializers import LocationQuerySerializer, TripPlanRequestSerializer
from trips.service import TripPlannerService


class HealthView(APIView):
    def get(self, request: object) -> Response:
        return Response(
            {
                "status": "ok",
                "service": "spotter-route-eld-api",
                "provider": "demo" if settings.USE_DEMO_PROVIDER else "geoapify",
            }
        )


class LocationSuggestView(APIView):
    def get(self, request: object) -> Response:
        serializer = LocationQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        service = None
        try:
            service = TripPlannerService()
            result = service.suggest(serializer.validated_data["q"])
        except ProviderError as exc:
            raise _api_provider_error(exc) from exc
        finally:
            if service is not None:
                service.close()
        return Response(result)


class TripPlanView(APIView):
    def post(self, request: object) -> Response:
        serializer = TripPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = None
        try:
            service = TripPlannerService()
            result = service.create_plan(serializer.validated_data)
        except ProviderError as exc:
            raise _api_provider_error(exc) from exc
        except SchedulingError as exc:
            raise ApiError(
                "route_not_schedulable",
                str(exc),
                status_code=422,
            ) from exc
        finally:
            if service is not None:
                service.close()
        return Response(result, status=201)


def _api_provider_error(exc: ProviderError) -> ApiError:
    return ApiError(
        exc.code,
        exc.message,
        status_code=exc.status_code,
        retryable=exc.retryable,
    )
