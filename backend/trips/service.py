"""Application service coordinating provider I/O and pure trip projections."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime
from hashlib import sha256
from math import inf
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache

from trips.domain import (
    ROUTE_MILE_PREFIX,
    DutyEvent,
    Location,
    NearbyPlace,
    RouteResult,
    haversine_miles,
    route_mile_key,
)
from trips.logs import build_daily_logs, collect_log_location_points
from trips.providers import DemoRoutingProvider, GeoapifyRoutingProvider, RoutingProvider
from trips.providers.base import ProviderError
from trips.scheduler import schedule_route

MAP_ATTRIBUTION = "© OpenFreeMap © OpenStreetMap contributors"
MAX_FUEL_SUGGESTION_MILES = 5.0
MAX_OPTIONAL_STOP_LOOKUPS = 12
MAX_PROVIDER_LOOKUP_CONCURRENCY = 4
ROUTE_GEOMETRY_TOLERANCE_DEGREES = 0.0001
SUGGESTION_CACHE_SECONDS = 5 * 60

ASSUMPTIONS = [
    "Property-carrying driver using the 70-hour/8-day cycle with no adverse-condition extension.",
    "The driver completed 10 consecutive hours off duty immediately before the selected duty start.",
    "Each driving shift begins with a 30-minute On Duty—not driving pre-trip inspection.",
    "Driving is limited to 11 hours within a 14-hour window after the qualifying 10-hour rest.",
    "A 34-hour restart is inserted when the simplified cycle is exhausted or its remaining balance cannot support the next pre-trip inspection plus additional driving.",
    "The planner shows a full 34-hour restart and does not credit the separate 10-hour pre-departure rest because prior-duty records are not supplied.",
    "Pickup and drop-off each take exactly one hour and are logged On Duty—not driving.",
    "A dedicated 30-minute break is shown as an Off Duty Meal/rest break; another qualifying non-driving stop can satisfy the eight-hour driving-break rule.",
    "A normal daily rest is shown as one hour Off Duty for a meal/dinner break followed by nine consecutive hours in the Sleeper Berth; together they provide 10 consecutive qualifying hours.",
    "Off Duty meal/rest time assumes the driver is relieved of work, vehicle, and cargo responsibility and is free to pursue personal activities.",
    "The vehicle is assumed to have a compliant sleeper berth that the driver uses for the modeled Sleeper Berth periods.",
    "The home-terminal 24-hour log period is assumed to run from midnight to midnight.",
    "Time before plan start on the first log day and after trip completion is assumed Off Duty.",
    "The truck begins with a full tank and fuels near mile 950, before any 1,000-mile interval.",
    "No separate fixed-duration post-trip event is assumed; any inspection or reporting work actually performed must be logged On Duty—not driving.",
    "Traffic, weather, split sleeper berth, short-haul exceptions, team driving, and personal conveyance are excluded.",
]


def get_provider() -> RoutingProvider:
    if settings.USE_DEMO_PROVIDER:
        return DemoRoutingProvider()
    return GeoapifyRoutingProvider(
        settings.GEOAPIFY_API_KEY,
        timeout=settings.ROUTING_TIMEOUT_SECONDS,
    )


class TripPlannerService:
    def __init__(self, provider: RoutingProvider | None = None) -> None:
        self.provider = provider or get_provider()

    def suggest(self, query: str) -> dict[str, object]:
        canonical_query = " ".join(query.split())
        cache_identity = f"{type(self.provider).__name__}:{canonical_query.casefold()}"
        digest = sha256(cache_identity.encode("utf-8")).hexdigest()
        cache_key = f"trip-location-suggestions-v1:{digest}"
        cached = cache.get(cache_key)
        if isinstance(cached, dict):
            return cached

        suggestions = self.provider.suggest(canonical_query)
        result = {
            "suggestions": [_location_dict(location) for location in suggestions],
            "attribution": self.provider.attribution,
        }
        cache.set(cache_key, result, timeout=SUGGESTION_CACHE_SECONDS)
        return result

    def close(self) -> None:
        self.provider.close()

    def create_plan(self, data: dict[str, Any]) -> dict[str, object]:
        current = _location(data["current_location"])
        pickup = _location(data["pickup_location"])
        dropoff = _location(data["dropoff_location"])
        cycle_used = float(data["current_cycle_used_hours"])
        warnings = [
            (
                "The 70-hour/8-day paper recap is a conservative estimate: no prior hours "
                "are assumed to age out during this trip, A and C equal the simplified "
                "cycle total at each day's end, B is the remaining balance floored at "
                "zero, and a scheduled 34-hour restart resets the estimate."
            ),
            (
                "Break and rest markers are planning positions along the route; confirm safe, "
                "legal truck parking before driving."
            ),
        ]

        waypoints = [current, pickup, dropoff]
        timezone_name = data.get("home_terminal_timezone")
        if timezone_name:
            zone = ZoneInfo(str(timezone_name))
            departure_at = _departure_at(data.get("departure_at"), zone)
            route = self.provider.route(waypoints)
        else:
            # Routing does not depend on the home-terminal timezone. Starting both
            # provider calls together removes one full network round trip from the
            # common auto-timezone path while retaining the UTC fallback behavior.
            with ThreadPoolExecutor(max_workers=2) as executor:
                route_future = executor.submit(self.provider.route, waypoints)
                timezone_future = executor.submit(self.provider.reverse, current.coordinate)
                try:
                    reverse = timezone_future.result()
                    timezone_name = reverse.timezone or "UTC"
                    if reverse.timezone is None:
                        warnings.append(
                            "Home-terminal timezone could not be detected; UTC was used."
                        )
                    else:
                        warnings.append(
                            "Home-terminal timezone was inferred from Current location as a "
                            "planning proxy; verify it if the actual home terminal differs."
                        )
                except ProviderError:
                    timezone_name = "UTC"
                    warnings.append("Home-terminal timezone lookup failed; UTC was used.")
                zone = ZoneInfo(str(timezone_name))
                departure_at = _departure_at(data.get("departure_at"), zone)
                route = route_future.result()

        events = schedule_route(route, departure_at, cycle_used)
        location_points = collect_log_location_points(events, str(timezone_name), route)
        events, resolved_route_locations = self._enrich_provider_locations(
            events,
            location_points,
            warnings,
        )
        daily_logs = build_daily_logs(
            events,
            str(timezone_name),
            route,
            cycle_used,
            resolved_route_locations=resolved_route_locations,
        )
        metadata = dict(data.get("metadata") or {})
        stop_events = _route_stop_events(events)
        stops = [_stop_dict(event, index + 1) for index, event in enumerate(stop_events)]

        departure_utc = events[0].start_at.astimezone(UTC)
        arrival_utc = events[-1].end_at.astimezone(UTC)
        driving_hours = sum(event.duration_hours for event in events if event.status == "driving")
        total_elapsed_hours = (arrival_utc - departure_utc).total_seconds() / 3600

        if isinstance(self.provider, DemoRoutingProvider):
            warnings.insert(
                0,
                "Demo routing is active. Configure Geoapify for road-level heavy-truck routes and real places.",
            )

        return {
            "id": str(uuid4()),
            "created_at": _iso(datetime.now(UTC)),
            "route": {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        list(coordinate) for coordinate in _serialized_route_coordinates(route)
                    ],
                },
                "properties": {
                    "distance_miles": round(route.distance_miles, 2),
                    "duration_hours": round(route.duration_hours, 2),
                },
            },
            "instructions": [_instruction_dict(instruction) for instruction in route.instructions],
            "summary": {
                "distance_miles": round(route.distance_miles, 2),
                "driving_hours": round(driving_hours, 2),
                "total_elapsed_hours": round(total_elapsed_hours, 2),
                "trip_days": len(daily_logs),
                "stop_count": len(stops),
                "departure_at": _iso(departure_utc),
                "arrival_at": _iso(arrival_utc),
                "home_terminal_timezone": str(timezone_name),
            },
            "stops": stops,
            "duty_events": [_event_dict(event) for event in events],
            "daily_logs": daily_logs,
            "metadata": metadata,
            "assumptions": ASSUMPTIONS,
            "warnings": warnings,
            "notice": "Generated trip plan — not a certified ELD record.",
            "attribution": {
                "routing": route.attribution,
                "map": MAP_ATTRIBUTION,
            },
        }

    def _resolve_duty_locations(
        self,
        events: list[DutyEvent],
        location_points: dict[float, tuple[float, float]],
    ) -> tuple[list[DutyEvent], dict[float, str]]:
        """Resolve required log locations and propagate them across event boundaries.

        These labels are part of the generated paper-log record, so an unresolved
        required point fails generation instead of returning a route-mile placeholder.
        """

        return self._enrich_provider_locations(
            events,
            location_points,
            [],
            include_fuel=False,
        )

    def _enrich_fuel_suggestions(
        self,
        events: list[DutyEvent],
        warnings: list[str],
    ) -> list[DutyEvent]:
        enriched, _resolved = self._enrich_provider_locations(events, {}, warnings)
        return enriched

    def _enrich_provider_locations(
        self,
        events: list[DutyEvent],
        location_points: dict[float, tuple[float, float]],
        warnings: list[str],
        *,
        include_fuel: bool = True,
    ) -> tuple[list[DutyEvent], dict[float, str]]:
        """Resolve required labels and optional fuel suggestions in one bounded pool."""

        required_candidates = list(location_points.items())
        fuel_groups: dict[tuple[float, float], tuple[DutyEvent, list[int]]] = {}
        fuel_warning_added = False
        lookup_limit_warning_added = False

        if include_fuel:
            for index, event in enumerate(events):
                if event.event_type != "fuel":
                    continue
                lon, lat = event.start_coordinates
                key = (round(lon, 5), round(lat, 5))
                existing = fuel_groups.get(key)
                if existing is not None:
                    existing[1].append(index)
                    continue
                if len(fuel_groups) >= MAX_OPTIONAL_STOP_LOOKUPS:
                    if not lookup_limit_warning_added:
                        warnings.append(
                            "Additional optional fuel-station suggestions were skipped to keep "
                            "route generation responsive."
                        )
                        lookup_limit_warning_added = True
                    continue
                fuel_groups[key] = (event, [index])

        fuel_candidates = list(fuel_groups.items())
        if not required_candidates and not fuel_candidates:
            return list(events), {}

        resolved: dict[float, str] = {}
        lookup_results: dict[tuple[float, float], NearbyPlace | None] = {}
        provider_failed = False
        required_error: ProviderError | None = None

        # Submit required work first so it receives the first available worker slots.
        # Fuel suggestions share the same executor, so one request never exceeds the
        # provider concurrency ceiling even on long routes.
        total_lookups = len(required_candidates) + len(fuel_candidates)
        with ThreadPoolExecutor(
            max_workers=min(MAX_PROVIDER_LOOKUP_CONCURRENCY, total_lookups)
        ) as executor:
            required_futures = {
                mile: executor.submit(self.provider.reverse, coordinate)
                for mile, coordinate in required_candidates
            }
            fuel_futures = {
                key: executor.submit(self.provider.nearby_fuel, event.start_coordinates)
                for key, (event, _indices) in fuel_candidates
            }

            for mile, _coordinate in required_candidates:
                try:
                    result = required_futures[mile].result()
                    resolved[mile] = _required_location_label(result.label)
                except ProviderError as exc:
                    if required_error is None:
                        required_error = exc

            for key, _group in fuel_candidates:
                try:
                    lookup_results[key] = fuel_futures[key].result()
                except ProviderError:
                    provider_failed = True

        if required_error is not None:
            raise required_error

        if provider_failed:
            warnings.append(
                "Some optional fuel-station suggestions could not be resolved; "
                "unsuccessful fuel lookups were skipped."
            )

        enriched = [
            replace(
                event,
                start_location=resolved.get(
                    route_mile_key(event.start_mile),
                    event.start_location,
                ),
                end_location=resolved.get(
                    route_mile_key(event.end_mile),
                    event.end_location,
                ),
            )
            for event in events
        ]

        for key, (event, indices) in fuel_candidates:
            if key not in lookup_results:
                continue
            place = lookup_results[key]
            for index in indices:
                fuel_event = enriched[index]
                if place is not None:
                    distance_miles = haversine_miles(
                        fuel_event.start_coordinates,
                        (place.lon, place.lat),
                    )
                    if distance_miles <= MAX_FUEL_SUGGESTION_MILES:
                        enriched[index] = fuel_event.with_nearby_suggestion(
                            place,
                            distance_miles,
                        )
                    elif not fuel_warning_added:
                        warnings.append(
                            f"{place.label} was {distance_miles:.1f} mi from "
                            "the scheduled route point and was ignored because "
                            "it is outside the 5-mile fuel-suggestion radius; "
                            "not added to route."
                        )
                        fuel_warning_added = True
                elif not fuel_warning_added:
                    warnings.append(
                        "A fuel station within 5 miles of the scheduled route point "
                        "could not be confirmed; the scheduled city/state location is shown."
                    )
                    fuel_warning_added = True

        return enriched, resolved


def _location(value: dict[str, Any]) -> Location:
    return Location(
        id=str(value.get("id") or ""),
        label=str(value["label"]),
        lat=float(value["lat"]),
        lon=float(value["lon"]),
        city=str(value.get("city") or ""),
        state=str(value.get("state") or ""),
        country=str(value.get("country") or "United States"),
    )


def _departure_at(value: object, zone: ZoneInfo) -> datetime:
    if value is None:
        return datetime.now(zone).replace(second=0, microsecond=0)
    if not isinstance(value, datetime):
        raise TypeError("departure_at must be normalized by the request serializer")
    if value.tzinfo is not None:
        return value

    candidate = value.replace(tzinfo=zone)
    if candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != value:
        from trips.exceptions import ApiError

        raise ApiError(
            "validation_error",
            "This local time does not exist in the selected timezone.",
            field="departure_at",
        )
    alternative = value.replace(tzinfo=zone, fold=1)
    if candidate.utcoffset() != alternative.utcoffset():
        from trips.exceptions import ApiError

        raise ApiError(
            "validation_error",
            (
                "This local time occurs twice because daylight saving time "
                "ends. Include an explicit UTC offset, such as -04:00 or "
                "-05:00."
            ),
            field="departure_at",
        )
    return candidate


def _serialized_route_coordinates(route: RouteResult) -> tuple[tuple[float, float], ...]:
    """Return a visually faithful, compact copy without changing planner geometry."""

    leg_paths = route.leg_coordinates
    if len(leg_paths) == len(route.legs) and all(len(path) >= 2 for path in leg_paths):
        simplified: list[tuple[float, float]] = []
        for path in leg_paths:
            leg = _simplify_coordinates(path, ROUTE_GEOMETRY_TOLERANCE_DEGREES)
            if simplified and leg[0] == simplified[-1]:
                simplified.extend(leg[1:])
            else:
                simplified.extend(leg)
        if len(simplified) >= 2:
            return tuple(simplified)

    return _simplify_coordinates(route.coordinates, ROUTE_GEOMETRY_TOLERANCE_DEGREES)


def _simplify_coordinates(
    coordinates: tuple[tuple[float, float], ...],
    tolerance: float,
) -> tuple[tuple[float, float], ...]:
    """Iterative Ramer-Douglas-Peucker simplification in longitude/latitude space."""

    if len(coordinates) <= 2 or tolerance <= 0:
        return tuple(coordinates)

    keep = {0, len(coordinates) - 1}
    pending = [(0, len(coordinates) - 1)]
    tolerance_squared = tolerance * tolerance

    while pending:
        start_index, end_index = pending.pop()
        start = coordinates[start_index]
        end = coordinates[end_index]
        furthest_index: int | None = None
        furthest_distance = -inf

        for index in range(start_index + 1, end_index):
            distance = _squared_segment_distance(coordinates[index], start, end)
            if distance > furthest_distance:
                furthest_distance = distance
                furthest_index = index

        if furthest_index is not None and furthest_distance > tolerance_squared:
            keep.add(furthest_index)
            pending.append((start_index, furthest_index))
            pending.append((furthest_index, end_index))

    return tuple(coordinates[index] for index in sorted(keep))


def _squared_segment_distance(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    delta_lon = end[0] - start[0]
    delta_lat = end[1] - start[1]
    if delta_lon == 0 and delta_lat == 0:
        return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2

    fraction = ((point[0] - start[0]) * delta_lon + (point[1] - start[1]) * delta_lat) / (
        delta_lon * delta_lon + delta_lat * delta_lat
    )
    fraction = min(1.0, max(0.0, fraction))
    projected_lon = start[0] + fraction * delta_lon
    projected_lat = start[1] + fraction * delta_lat
    return (point[0] - projected_lon) ** 2 + (point[1] - projected_lat) ** 2


def _required_location_label(label: str) -> str:
    normalized = label.strip()
    if not normalized or normalized.startswith(ROUTE_MILE_PREFIX):
        raise ProviderError(
            "location_not_found",
            "A required duty-change location could not be resolved to city and state.",
        )
    return normalized


def _location_dict(location: Location) -> dict[str, object]:
    return {
        "id": location.id,
        "label": location.label,
        "city": location.city,
        "state": location.state,
        "country": location.country,
        "lat": location.lat,
        "lon": location.lon,
    }


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _instruction_dict(instruction: object) -> dict[str, object]:
    return {
        "id": instruction.id,
        "leg_index": instruction.leg_index,
        "sequence": instruction.sequence,
        "instruction": instruction.instruction,
        "distance_miles": round(instruction.distance_miles, 2),
        "duration_minutes": round(instruction.duration_minutes, 1),
        "start_mile": round(instruction.start_mile, 2),
        "end_mile": round(instruction.end_mile, 2),
    }


def _event_dict(event: DutyEvent) -> dict[str, object]:
    return {
        "id": event.id,
        "status": event.status,
        "event_type": event.event_type,
        "start_at": _iso(event.start_at),
        "end_at": _iso(event.end_at),
        "duration_hours": round(event.duration_hours, 3),
        "start_location": event.start_location,
        "end_location": event.end_location,
        "start_coordinates": list(event.start_coordinates),
        "end_coordinates": list(event.end_coordinates),
        "start_mile": round(event.start_mile, 2),
        "end_mile": round(event.end_mile, 2),
        "miles_driven": round(event.miles_driven, 2),
        "note": event.note,
    }


def _route_stop_events(events: list[DutyEvent]) -> list[DutyEvent]:
    """Return geographic stops without duplicating log-only duty changes.

    Pre-trip inspections remain in the canonical timeline and daily logs but
    do not create a second marker over the current/rest location. The meal
    period that begins a normal overnight rest is represented by the following
    sleeper-rest marker at the same route point.
    """

    stops: list[DutyEvent] = []
    index = 0
    while index < len(events):
        event = events[index]
        if event.status == "driving" or event.event_type == "pretrip_inspection":
            index += 1
            continue
        next_event = events[index + 1] if index + 1 < len(events) else None
        begins_sleeper_rest = (
            event.event_type == "meal_break"
            and next_event is not None
            and next_event.event_type == "rest"
            and event.end_at == next_event.start_at
            and abs(event.start_mile - next_event.start_mile) < 1e-7
        )
        if begins_sleeper_rest:
            stops.append(
                replace(
                    next_event,
                    start_at=event.start_at,
                    status="sleeper_berth",
                    note=(
                        "10 consecutive hours of qualifying rest: a one-hour Off Duty "
                        "meal/dinner break followed by nine hours in the Sleeper Berth."
                    ),
                )
            )
            index += 2
            continue
        stops.append(event)
        index += 1
    return stops


def _stop_dict(event: DutyEvent, sequence: int) -> dict[str, object]:
    lon, lat = event.start_coordinates
    return {
        "id": event.id,
        "sequence": sequence,
        "type": event.event_type,
        "label": event.start_location,
        "lat": lat,
        "lon": lon,
        "scheduled_at": _iso(event.start_at),
        "end_at": _iso(event.end_at),
        "duration_minutes": round(event.duration_hours * 60, 1),
        "duty_status": event.status,
        "reason": event.note,
        "route_mile": round(event.start_mile, 2),
    }
