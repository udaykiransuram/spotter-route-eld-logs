"""Geoapify adapter with normalized contracts and transient retry handling."""

from __future__ import annotations

import atexit
from collections.abc import Iterable
from math import isfinite
from threading import Lock
from typing import Any

import httpx

from trips.domain import (
    Location,
    NearbyPlace,
    ReverseLocation,
    RouteInstruction,
    RouteLeg,
    RouteResult,
    haversine_miles,
)
from trips.providers.base import ProviderError

METERS_PER_MILE = 1609.344
FUEL_SEARCH_RADIUS_METERS = 8000
_shared_clients: dict[float, httpx.Client] = {}
_shared_clients_lock = Lock()


def _shared_client(timeout: float) -> httpx.Client:
    with _shared_clients_lock:
        client = _shared_clients.get(timeout)
        if client is None:
            client = httpx.Client(timeout=timeout)
            _shared_clients[timeout] = client
        return client


def _close_shared_clients() -> None:
    with _shared_clients_lock:
        clients = list(_shared_clients.values())
        _shared_clients.clear()
    for client in clients:
        client.close()


atexit.register(_close_shared_clients)


class GeoapifyRoutingProvider:
    attribution = "Powered by Geoapify"
    base_url = "https://api.geoapify.com"

    def __init__(
        self,
        api_key: str,
        *,
        timeout: float = 12,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise ProviderError(
                "provider_not_configured",
                "Geoapify is not configured. Add GEOAPIFY_API_KEY or enable demo mode.",
                status_code=503,
            )
        self.api_key = api_key
        self._owns_client = transport is not None
        self.client = (
            httpx.Client(timeout=timeout, transport=transport)
            if self._owns_client
            else _shared_client(timeout)
        )

    def suggest(self, query: str, *, limit: int = 6) -> list[Location]:
        payload = self._get(
            "/v1/geocode/autocomplete",
            {
                "text": query,
                "format": "json",
                "filter": "countrycode:us",
                "limit": limit,
            },
        )
        results = payload.get("results", [])
        if not isinstance(results, list):
            raise _invalid_response()
        try:
            return [self._location_from_properties(item) for item in results]
        except (KeyError, TypeError, ValueError) as exc:
            raise _invalid_response() from exc

    def route(self, waypoints: list[Location]) -> RouteResult:
        payload = self._get(
            "/v1/routing",
            {
                "waypoints": "|".join(
                    f"{float(point.lat)},{float(point.lon)}" for point in waypoints
                ),
                "mode": "heavy_truck",
                "intermediate_waypoint_mode": "stopover",
                "details": "instruction_details",
                "traffic": "free_flow",
                "format": "geojson",
            },
        )
        features = payload.get("features") or []
        if not isinstance(features, list):
            raise _invalid_response()
        if not features:
            raise ProviderError(
                "route_not_found",
                "No truck route could be calculated for those locations.",
                status_code=422,
            )

        feature = features[0]
        if not isinstance(feature, dict):
            raise _invalid_response()
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            raise _invalid_response()
        try:
            coordinates = tuple(self._flatten_geometry(geometry))
        except (IndexError, TypeError, ValueError) as exc:
            raise _invalid_response() from exc
        if len(coordinates) < 2:
            raise ProviderError(
                "invalid_provider_response",
                "The routing provider returned an incomplete route.",
            )

        raw_legs = properties.get("legs") or []
        if not isinstance(raw_legs, list):
            raise _invalid_response()
        if raw_legs and (
            len(raw_legs) != len(waypoints) - 1
            or not all(isinstance(raw_leg, dict) for raw_leg in raw_legs)
        ):
            raise _invalid_response("The routing provider returned incomplete route legs.")
        try:
            legs = self._parse_legs(raw_legs, waypoints, properties)
            leg_coordinates = self._leg_coordinates_from_geometry(geometry, len(legs))
            instructions = self._parse_instructions(raw_legs, legs)
        except ProviderError:
            raise
        except (AttributeError, IndexError, KeyError, TypeError, ValueError) as exc:
            raise _invalid_response() from exc
        distance = sum(leg.distance_miles for leg in legs)
        duration = sum(leg.duration_hours for leg in legs)
        return RouteResult(
            coordinates=coordinates,
            legs=tuple(legs),
            instructions=tuple(instructions),
            distance_miles=distance,
            duration_hours=duration,
            attribution=self.attribution,
            leg_coordinates=leg_coordinates,
        )

    def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace | None:
        lon, lat = coordinate
        payload = self._get(
            "/v2/places",
            {
                "categories": "service.vehicle.fuel",
                "filter": f"circle:{lon},{lat},{FUEL_SEARCH_RADIUS_METERS}",
                "bias": f"proximity:{lon},{lat}",
                "limit": 1,
            },
        )
        features = payload.get("features") or []
        if not isinstance(features, list):
            raise _invalid_response()
        if not features:
            return None
        try:
            properties = features[0].get("properties") or {}
            lat = float(properties["lat"])
            lon = float(properties["lon"])
            if (
                not isfinite(lat)
                or not isfinite(lon)
                or not -90 <= lat <= 90
                or not -180 <= lon <= 180
            ):
                raise ValueError("invalid fuel coordinates")
            return NearbyPlace(
                label=properties.get("name") or properties.get("formatted") or "Fuel stop",
                lat=lat,
                lon=lon,
            )
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            raise _invalid_response() from exc

    def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
        lon, lat = coordinate
        payload = self._get(
            "/v1/geocode/reverse",
            {"lat": lat, "lon": lon, "format": "json", "limit": 1},
        )
        results = payload.get("results") or []
        if not isinstance(results, list):
            raise _invalid_response()
        if not results:
            raise ProviderError(
                "location_not_found",
                "A duty-change location could not be reverse-geocoded.",
            )
        properties = results[0]
        if not isinstance(properties, dict):
            raise _invalid_response()
        timezone = properties.get("timezone") or {}
        if not isinstance(timezone, dict):
            raise _invalid_response()
        timezone_name = timezone.get("name") if isinstance(timezone, dict) else None
        if timezone_name is not None and not isinstance(timezone_name, str):
            raise _invalid_response()
        label = _eld_location_label(properties)
        if not label:
            raise _invalid_response("The routing provider returned an incomplete location.")
        return ReverseLocation(label, timezone_name)

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        request_params = {**params, "apiKey": self.api_key}
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = self.client.get(f"{self.base_url}{path}", params=request_params)
            except httpx.TransportError as exc:
                last_error = exc
                if attempt == 0:
                    continue
                raise ProviderError(
                    "provider_unavailable",
                    "The routing provider is temporarily unavailable.",
                    retryable=True,
                ) from exc

            if response.status_code in {502, 503, 504} and attempt == 0:
                continue
            if response.status_code == 429:
                raise ProviderError(
                    "provider_quota_exceeded",
                    "The routing service quota has been reached. Try again later.",
                    retryable=True,
                    status_code=503,
                )
            if response.status_code in {401, 403}:
                raise ProviderError(
                    "provider_not_configured",
                    "The routing service credentials were rejected.",
                    status_code=503,
                )
            if response.status_code >= 400:
                raise ProviderError(
                    "provider_request_failed",
                    "The routing provider could not process this request.",
                    retryable=response.status_code >= 500,
                )
            try:
                payload = response.json()
            except ValueError as exc:
                raise ProviderError(
                    "invalid_provider_response",
                    "The routing provider returned an invalid response.",
                ) from exc
            if not isinstance(payload, dict):
                raise _invalid_response()
            return payload

        raise ProviderError(
            "provider_unavailable",
            "The routing provider is temporarily unavailable.",
            retryable=True,
        ) from last_error

    @staticmethod
    def _location_from_properties(item: dict[str, Any]) -> Location:
        if not isinstance(item, dict):
            raise TypeError("location result must be an object")
        lat = float(item["lat"])
        lon = float(item["lon"])
        if not isfinite(lat) or not isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError("invalid location coordinates")
        return Location(
            id=str(item.get("place_id") or item.get("formatted") or ""),
            label=item.get("formatted") or item.get("address_line1") or "Unknown location",
            lat=lat,
            lon=lon,
            city=item.get("city") or item.get("county") or "",
            state=item.get("state_code") or item.get("state") or "",
            country=item.get("country") or "United States",
        )

    @staticmethod
    def _flatten_geometry(geometry: dict[str, Any]) -> Iterable[tuple[float, float]]:
        coordinates = geometry.get("coordinates") or []
        if geometry.get("type") == "LineString":
            for coordinate in coordinates:
                yield (float(coordinate[0]), float(coordinate[1]))
            return
        if geometry.get("type") == "MultiLineString":
            previous: tuple[float, float] | None = None
            for line in coordinates:
                for coordinate in line:
                    point = (float(coordinate[0]), float(coordinate[1]))
                    if point != previous:
                        yield point
                    previous = point

    @staticmethod
    def _leg_coordinates_from_geometry(
        geometry: dict[str, Any], leg_count: int
    ) -> tuple[tuple[tuple[float, float], ...], ...]:
        if geometry.get("type") != "MultiLineString":
            return ()
        lines = geometry.get("coordinates") or []
        if len(lines) != leg_count:
            return ()

        leg_coordinates: list[tuple[tuple[float, float], ...]] = []
        for line in lines:
            if len(line) < 2:
                return ()
            leg_coordinates.append(
                tuple((float(coordinate[0]), float(coordinate[1])) for coordinate in line)
            )
        return tuple(leg_coordinates)

    @staticmethod
    def _parse_legs(
        raw_legs: list[dict[str, Any]],
        waypoints: list[Location],
        properties: dict[str, Any],
    ) -> list[RouteLeg]:
        total_distance_m = float(properties.get("distance") or 0)
        total_time_s = float(properties.get("time") or 0)
        direct_distances = [
            haversine_miles(start.coordinate, end.coordinate)
            for start, end in zip(waypoints, waypoints[1:])
        ]
        direct_total = sum(direct_distances) or 1
        legs: list[RouteLeg] = []
        for index, (start, end) in enumerate(zip(waypoints, waypoints[1:])):
            raw = raw_legs[index] if index < len(raw_legs) else {}
            ratio = direct_distances[index] / direct_total
            distance_m = float(raw.get("distance") or total_distance_m * ratio)
            duration_s = float(raw.get("time") or total_time_s * ratio)
            legs.append(
                RouteLeg(
                    index=index,
                    start=start,
                    end=end,
                    distance_miles=distance_m / METERS_PER_MILE,
                    duration_hours=duration_s / 3600,
                )
            )
        if not legs or any(
            not isfinite(leg.distance_miles)
            or not isfinite(leg.duration_hours)
            or leg.distance_miles <= 0
            or leg.duration_hours <= 0
            for leg in legs
        ):
            raise ProviderError(
                "invalid_provider_response",
                "The routing provider returned invalid route totals.",
            )
        return legs

    @staticmethod
    def _parse_instructions(
        raw_legs: list[dict[str, Any]], legs: list[RouteLeg]
    ) -> list[RouteInstruction]:
        instructions: list[RouteInstruction] = []
        cumulative_miles = 0.0
        sequence = 1
        for leg in legs:
            raw = raw_legs[leg.index] if leg.index < len(raw_legs) else {}
            steps = raw.get("steps") or []
            if not isinstance(steps, list) or not all(isinstance(step, dict) for step in steps):
                raise _invalid_response()
            step_mile = cumulative_miles
            for step in steps:
                distance = float(step.get("distance") or 0) / METERS_PER_MILE
                duration = float(step.get("time") or 0) / 60
                if not isfinite(distance) or not isfinite(duration) or distance < 0 or duration < 0:
                    raise _invalid_response()
                instruction_value = step.get("instruction") or {}
                if isinstance(instruction_value, dict):
                    text = instruction_value.get("text") or instruction_value.get("type")
                else:
                    text = str(instruction_value)
                instructions.append(
                    RouteInstruction(
                        id=f"instruction-{sequence}",
                        leg_index=leg.index,
                        sequence=sequence,
                        instruction=text or f"Continue toward {leg.end.label}",
                        distance_miles=distance,
                        duration_minutes=duration,
                        start_mile=step_mile,
                        end_mile=step_mile + distance,
                    )
                )
                step_mile += distance
                sequence += 1
            if not steps:
                instructions.append(
                    RouteInstruction(
                        id=f"instruction-{sequence}",
                        leg_index=leg.index,
                        sequence=sequence,
                        instruction=f"Drive from {leg.start.label} to {leg.end.label}",
                        distance_miles=leg.distance_miles,
                        duration_minutes=leg.duration_hours * 60,
                        start_mile=cumulative_miles,
                        end_mile=cumulative_miles + leg.distance_miles,
                    )
                )
                sequence += 1
            cumulative_miles += leg.distance_miles
        return instructions


def _invalid_response(
    message: str = "The routing provider returned an invalid response.",
) -> ProviderError:
    return ProviderError("invalid_provider_response", message)


def _eld_location_label(properties: dict[str, Any]) -> str:
    """Prefer the concise locality and state format expected in paper-log remarks."""

    locality = next(
        (
            str(properties.get(field)).strip()
            for field in ("city", "town", "village", "municipality", "hamlet", "county")
            if properties.get(field)
        ),
        "",
    )
    state = str(properties.get("state_code") or properties.get("state") or "").strip()
    if locality and state:
        return f"{locality}, {state}"
    return str(properties.get("formatted") or "").strip()
