"""Provider-neutral domain types used by routing and HOS calculations."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from math import asin, cos, radians, sin, sqrt
from typing import Literal

DutyStatus = Literal["off_duty", "sleeper_berth", "driving", "on_duty"]
EventType = Literal[
    "driving",
    "pretrip_inspection",
    "pickup",
    "dropoff",
    "fuel",
    "break",
    "meal_break",
    "rest",
    "cycle_restart",
]

ROUTE_MILE_PREFIX = "Route mile "
ROUTE_MILE_KEY_PRECISION = 3


def route_mile_key(route_mile: float) -> float:
    """Return a stable request-local key for one canonical route position."""

    return round(float(route_mile), ROUTE_MILE_KEY_PRECISION)


@dataclass(frozen=True, slots=True)
class Location:
    label: str
    lat: float
    lon: float
    id: str = ""
    city: str = ""
    state: str = ""
    country: str = "United States"

    @property
    def coordinate(self) -> tuple[float, float]:
        return (self.lon, self.lat)


@dataclass(frozen=True, slots=True)
class RouteLeg:
    index: int
    start: Location
    end: Location
    distance_miles: float
    duration_hours: float


@dataclass(frozen=True, slots=True)
class RouteInstruction:
    id: str
    leg_index: int
    sequence: int
    instruction: str
    distance_miles: float
    duration_minutes: float
    start_mile: float
    end_mile: float


@dataclass(frozen=True, slots=True)
class RouteResult:
    coordinates: tuple[tuple[float, float], ...]
    legs: tuple[RouteLeg, ...]
    instructions: tuple[RouteInstruction, ...]
    distance_miles: float
    duration_hours: float
    attribution: str
    leg_coordinates: tuple[tuple[tuple[float, float], ...], ...] = ()


@dataclass(frozen=True, slots=True)
class NearbyPlace:
    label: str
    lat: float
    lon: float


@dataclass(frozen=True, slots=True)
class ReverseLocation:
    label: str
    timezone: str | None = None


@dataclass(frozen=True, slots=True)
class DutyEvent:
    id: str
    status: DutyStatus
    event_type: EventType
    start_at: datetime
    end_at: datetime
    start_location: str
    end_location: str
    start_coordinates: tuple[float, float]
    end_coordinates: tuple[float, float]
    start_mile: float
    end_mile: float
    miles_driven: float
    note: str

    @property
    def duration_hours(self) -> float:
        return (self.end_at.astimezone(UTC) - self.start_at.astimezone(UTC)).total_seconds() / 3600

    def with_nearby_suggestion(self, place: NearbyPlace, distance_miles: float) -> "DutyEvent":
        """Attach a nearby-place suggestion without moving the route event."""

        return replace(
            self,
            note=(
                f"{self.note} Nearby fuel suggestion: {place.label} "
                f"({distance_miles:.1f} mi from the scheduled route point; "
                "not added to route)."
            ),
        )


def haversine_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Return great-circle distance for two ``(lon, lat)`` coordinates."""

    lon1, lat1 = map(radians, a)
    lon2, lat2 = map(radians, b)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 3958.7613 * 2 * asin(sqrt(value))


class RouteLocator:
    """Interpolate coordinates and human labels at a reported route mile."""

    def __init__(self, route: RouteResult):
        self.route = route
        if not route.legs:
            self._boundaries: list[tuple[float, Location]] = []
            self._leg_paths: list[tuple[tuple[float, float], ...]] = []
            self._leg_geometry_lengths: list[tuple[float, ...]] = []
            self._leg_geometry_totals: list[float] = []
            return

        boundaries: list[tuple[float, Location]] = [(0.0, route.legs[0].start)]
        mileage = 0.0
        for leg in route.legs:
            mileage += leg.distance_miles
            boundaries.append((mileage, leg.end))
        self._boundaries = boundaries

        explicit_leg_paths = (
            route.leg_coordinates
            if len(route.leg_coordinates) == len(route.legs)
            and all(len(path) >= 2 for path in route.leg_coordinates)
            else ()
        )
        boundary_indexes = [] if explicit_leg_paths else self._boundary_coordinate_indexes()
        self._leg_paths = []
        self._leg_geometry_lengths = []
        self._leg_geometry_totals = []
        for index, leg in enumerate(route.legs):
            # Provider waypoint coordinates are authoritative. Interior route
            # geometry remains useful even when its endpoints are slightly
            # snapped to the road network.
            path = [leg.start.coordinate]
            if explicit_leg_paths:
                interior_coordinates = explicit_leg_paths[index][1:-1]
            else:
                start_index = boundary_indexes[index]
                end_index = boundary_indexes[index + 1]
                interior_coordinates = route.coordinates[start_index + 1 : end_index]
            for coordinate in interior_coordinates:
                if coordinate != path[-1]:
                    path.append(coordinate)
            if leg.end.coordinate != path[-1]:
                path.append(leg.end.coordinate)
            if len(path) == 1:
                path.append(leg.end.coordinate)

            lengths = tuple(haversine_miles(start, end) for start, end in zip(path, path[1:]))
            self._leg_paths.append(tuple(path))
            self._leg_geometry_lengths.append(lengths)
            self._leg_geometry_totals.append(sum(lengths))

    def _boundary_coordinate_indexes(self) -> list[int]:
        if not self.route.coordinates:
            return [0] * (len(self.route.legs) + 1)

        last_index = len(self.route.coordinates) - 1
        indexes = [0]
        search_start = 0
        for leg_index, leg in enumerate(self.route.legs[:-1]):
            remaining_boundaries = len(self.route.legs) - leg_index - 1
            search_end = max(search_start, last_index - remaining_boundaries)
            candidates = range(search_start, search_end + 1)
            closest = min(
                candidates,
                key=lambda index: haversine_miles(
                    self.route.coordinates[index], leg.end.coordinate
                ),
            )
            indexes.append(closest)
            search_start = closest
        indexes.append(last_index)
        return indexes

    def coordinate_at(self, route_mile: float) -> tuple[float, float]:
        if not self.route.legs:
            return self.route.coordinates[0] if self.route.coordinates else (0.0, 0.0)

        clamped_mile = min(self.route.distance_miles, max(0.0, route_mile))
        tolerance = max(0.01, self.route.distance_miles * 1e-8)
        for mileage, location in self._boundaries:
            if abs(clamped_mile - mileage) <= tolerance:
                return location.coordinate

        leg_index = len(self.route.legs) - 1
        for index, (start_boundary, end_boundary) in enumerate(
            zip(self._boundaries, self._boundaries[1:])
        ):
            if start_boundary[0] <= clamped_mile < end_boundary[0]:
                leg_index = index
                break

        leg = self.route.legs[leg_index]
        leg_start_mile = self._boundaries[leg_index][0]
        leg_fraction = min(
            1.0,
            max(0.0, (clamped_mile - leg_start_mile) / leg.distance_miles),
        )
        geometry_total = self._leg_geometry_totals[leg_index]
        path = self._leg_paths[leg_index]
        if geometry_total <= 0:
            return path[0]

        target = leg_fraction * geometry_total
        covered = 0.0
        lengths = self._leg_geometry_lengths[leg_index]
        for index, length in enumerate(lengths):
            if covered + length >= target or index == len(lengths) - 1:
                local_fraction = 0.0 if length <= 0 else (target - covered) / length
                lon1, lat1 = path[index]
                lon2, lat2 = path[index + 1]
                return (
                    lon1 + (lon2 - lon1) * local_fraction,
                    lat1 + (lat2 - lat1) * local_fraction,
                )
            covered += length
        return path[-1]

    def label_at(self, route_mile: float) -> str:
        clamped_mile = min(self.route.distance_miles, max(0.0, route_mile))
        tolerance = max(0.01, self.route.distance_miles * 1e-8)
        for mileage, location in self._boundaries:
            if abs(clamped_mile - mileage) <= tolerance:
                return location.label
        return f"{ROUTE_MILE_PREFIX}{clamped_mile:,.0f}"
