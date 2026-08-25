"""Application service coordinating provider I/O and pure trip projections."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.conf import settings

from trips.domain import DutyEvent, Location, NearbyPlace, ReverseLocation, haversine_miles
from trips.logs import build_daily_logs
from trips.providers import DemoRoutingProvider, GeoapifyRoutingProvider, RoutingProvider
from trips.providers.base import ProviderError
from trips.scheduler import schedule_route

MAP_ATTRIBUTION = "© OpenFreeMap © OpenStreetMap contributors"
MAX_FUEL_SUGGESTION_MILES = 5.0
MAX_OPTIONAL_STOP_LOOKUPS = 12
MAX_OPTIONAL_STOP_CONCURRENCY = 4

ASSUMPTIONS = [
    "Property-carrying driver using the 70-hour/8-day cycle with no adverse-condition extension.",
    "The driver completed 10 consecutive hours off duty immediately before departure.",
    "Driving is limited to 11 hours within a 14-hour window after the qualifying 10-hour rest.",
    "When the simplified 70-hour balance is exhausted, a 34-hour restart is inserted before more driving.",
    "Pickup and drop-off each take exactly one hour and are logged On Duty—not driving.",
    "A 30-minute non-driving period satisfies the break after eight cumulative driving hours.",
    "The truck begins with a full tank and fuels near mile 950, before any 1,000-mile interval.",
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
        suggestions = self.provider.suggest(query)
        return {
            "suggestions": [_location_dict(location) for location in suggestions],
            "attribution": self.provider.attribution,
        }

    def close(self) -> None:
        self.provider.close()

    def create_plan(self, data: dict[str, Any]) -> dict[str, object]:
        current = _location(data["current_location"])
        pickup = _location(data["pickup_location"])
        dropoff = _location(data["dropoff_location"])
        cycle_used = float(data["current_cycle_used_hours"])
        warnings = [
            (
                "Only the starting 70-hour cycle total is available; prior eight-day daily "
                "history and recaps that require it cannot be reconstructed."
            )
        ]

        timezone_name = data.get("home_terminal_timezone")
        if not timezone_name:
            try:
                reverse = self.provider.reverse(current.coordinate)
                timezone_name = reverse.timezone or "UTC"
                if reverse.timezone is None:
                    warnings.append("Home-terminal timezone could not be detected; UTC was used.")
            except ProviderError:
                timezone_name = "UTC"
                warnings.append("Home-terminal timezone lookup failed; UTC was used.")
        zone = ZoneInfo(str(timezone_name))

        departure_at = data.get("departure_at")
        if departure_at is None:
            departure_at = datetime.now(zone).replace(second=0, microsecond=0)
        elif departure_at.tzinfo is None:
            candidate = departure_at.replace(tzinfo=zone)
            if candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != departure_at:
                from trips.exceptions import ApiError

                raise ApiError(
                    "validation_error",
                    "This local time does not exist in the selected timezone.",
                    field="departure_at",
                )
            alternative = departure_at.replace(tzinfo=zone, fold=1)
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
            departure_at = candidate

        route = self.provider.route([current, pickup, dropoff])
        events = schedule_route(route, departure_at, cycle_used)
        events = self._enrich_stops(events, warnings)
        daily_logs = build_daily_logs(events, str(timezone_name), route, cycle_used)
        metadata = dict(data.get("metadata") or {})
        stop_events = [event for event in events if event.status != "driving"]
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
                    "coordinates": [list(coordinate) for coordinate in route.coordinates],
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

    def _enrich_stops(self, events: list[DutyEvent], warnings: list[str]) -> list[DutyEvent]:
        enriched = list(events)
        fuel_warning_added = False
        lookup_limit_warning_added = False
        lookup_groups: dict[
            tuple[str, float, float],
            tuple[DutyEvent, list[int]],
        ] = {}

        for index, event in enumerate(events):
            needs_lookup = event.event_type in {"fuel", "break", "rest", "cycle_restart"}
            if not needs_lookup:
                continue
            lookup_type = "fuel" if event.event_type == "fuel" else "reverse"
            lon, lat = event.start_coordinates
            key = (lookup_type, round(lon, 5), round(lat, 5))
            existing = lookup_groups.get(key)
            if existing is not None:
                existing[1].append(index)
                continue
            if len(lookup_groups) >= MAX_OPTIONAL_STOP_LOOKUPS:
                if not lookup_limit_warning_added:
                    warnings.append(
                        "Additional optional stop-name lookups were skipped to keep route "
                        "generation responsive; route-mile labels are shown instead."
                    )
                    lookup_limit_warning_added = True
                continue
            lookup_groups[key] = (event, [index])

        candidates = list(lookup_groups.items())
        if not candidates:
            return enriched

        lookup_results: dict[
            tuple[str, float, float],
            NearbyPlace | ReverseLocation | None,
        ] = {}
        provider_failed = False

        # Probe one lookup first so a provider outage preserves the circuit breaker and
        # does not fan out more optional requests. Once healthy, independent lookups run
        # in small batches and are reassembled in canonical event order below.
        first_key, (first_event, _) = candidates[0]
        try:
            lookup_results[first_key] = self._lookup_stop(first_event)
        except ProviderError:
            provider_failed = True

        if not provider_failed and len(candidates) > 1:
            with ThreadPoolExecutor(max_workers=MAX_OPTIONAL_STOP_CONCURRENCY) as executor:
                remaining = candidates[1:]
                for batch_start in range(0, len(remaining), MAX_OPTIONAL_STOP_CONCURRENCY):
                    batch = remaining[batch_start : batch_start + MAX_OPTIONAL_STOP_CONCURRENCY]
                    futures = {
                        key: executor.submit(self._lookup_stop, event) for key, (event, _) in batch
                    }
                    for key, _group in batch:
                        try:
                            lookup_results[key] = futures[key].result()
                        except ProviderError:
                            provider_failed = True
                            break
                    if provider_failed:
                        break

        if provider_failed:
            warnings.append(
                "Some stop names could not be resolved; remaining optional lookups were "
                "skipped and route-mile labels are shown instead."
            )

        for key, (event, indices) in candidates:
            if key not in lookup_results:
                continue
            result = lookup_results[key]
            if event.event_type == "fuel":
                place = result if isinstance(result, NearbyPlace) else None
                for index in indices:
                    fuel_event = events[index]
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
                            "could not be confirmed; the route-mile fuel point is shown."
                        )
                        fuel_warning_added = True
                continue

            if isinstance(result, ReverseLocation):
                for index in indices:
                    enriched[index] = _with_reverse_location(events[index], result)

        return enriched

    def _lookup_stop(self, event: DutyEvent) -> NearbyPlace | ReverseLocation | None:
        if event.event_type == "fuel":
            return self.provider.nearby_fuel(event.start_coordinates)
        return self.provider.reverse(event.start_coordinates)


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


def _with_reverse_location(event: DutyEvent, reverse: ReverseLocation) -> DutyEvent:
    return replace(event, start_location=reverse.label, end_location=reverse.label)


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
