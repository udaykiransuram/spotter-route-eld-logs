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
        configured = settings.USE_DEMO_PROVIDER or bool(settings.GEOAPIFY_API_KEY)
        return Response(
            {
                "status": "ok" if configured else "not_configured",
                "service": "spotter-route-eld-api",
                "provider": "demo" if settings.USE_DEMO_PROVIDER else "geoapify",
                "configured": configured,
            },
            status=200 if configured else 503,
        )


class LocationSuggestView(APIView):
    throttle_scope = "location_suggest"

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
        response = Response(result)
        response["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
        return response


class TripPlanView(APIView):
    throttle_scope = "trip_plan"

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
