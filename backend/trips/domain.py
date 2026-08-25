"""Provider-neutral domain types used by routing and HOS calculations."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Literal

DutyStatus = Literal["off_duty", "sleeper_berth", "driving", "on_duty"]
EventType = Literal[
    "driving",
    "pickup",
    "dropoff",
    "fuel",
    "break",
    "rest",
    "cycle_restart",
]


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
        return (self.end_at - self.start_at).total_seconds() / 3600

    def with_stop(self, place: NearbyPlace) -> "DutyEvent":
        coordinate = (place.lon, place.lat)
        return replace(
            self,
            start_location=place.label,
            end_location=place.label,
            start_coordinates=coordinate,
            end_coordinates=coordinate,
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
        lengths: list[float] = []
        for start, end in zip(route.coordinates, route.coordinates[1:]):
            lengths.append(haversine_miles(start, end))
        self._geometry_lengths = lengths
        self._geometry_total = sum(lengths)

        boundaries: list[tuple[float, Location]] = [(0.0, route.legs[0].start)]
        mileage = 0.0
        for leg in route.legs:
            mileage += leg.distance_miles
            boundaries.append((mileage, leg.end))
        self._boundaries = boundaries

    def coordinate_at(self, route_mile: float) -> tuple[float, float]:
        if not self.route.coordinates:
            return (0.0, 0.0)
        if len(self.route.coordinates) == 1 or self._geometry_total <= 0:
            return self.route.coordinates[0]

        fraction = min(1.0, max(0.0, route_mile / self.route.distance_miles))
        target = fraction * self._geometry_total
        covered = 0.0
        for index, length in enumerate(self._geometry_lengths):
            if covered + length >= target or index == len(self._geometry_lengths) - 1:
                local_fraction = 0.0 if length <= 0 else (target - covered) / length
                lon1, lat1 = self.route.coordinates[index]
                lon2, lat2 = self.route.coordinates[index + 1]
                return (
                    lon1 + (lon2 - lon1) * local_fraction,
                    lat1 + (lat2 - lat1) * local_fraction,
                )
            covered += length
        return self.route.coordinates[-1]

    def label_at(self, route_mile: float) -> str:
        tolerance = max(0.01, self.route.distance_miles * 1e-8)
        for mileage, location in self._boundaries:
            if abs(route_mile - mileage) <= tolerance:
                return location.label
        return f"Route mile {route_mile:,.0f}"

