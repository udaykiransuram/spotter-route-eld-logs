"""Deterministic offline provider for evaluation, development, and tests."""

from __future__ import annotations

import hashlib

from trips.domain import (
    Location,
    NearbyPlace,
    ReverseLocation,
    RouteInstruction,
    RouteLeg,
    RouteResult,
    haversine_miles,
)

DEMO_LOCATIONS = (
    Location("Chicago, IL, USA", 41.8781, -87.6298, "demo-chicago", "Chicago", "IL"),
    Location("Columbus, OH, USA", 39.9612, -82.9988, "demo-columbus", "Columbus", "OH"),
    Location("Dallas, TX, USA", 32.7767, -96.7970, "demo-dallas", "Dallas", "TX"),
    Location("Denver, CO, USA", 39.7392, -104.9903, "demo-denver", "Denver", "CO"),
    Location("Houston, TX, USA", 29.7604, -95.3698, "demo-houston", "Houston", "TX"),
    Location("Los Angeles, CA, USA", 34.0522, -118.2437, "demo-los-angeles", "Los Angeles", "CA"),
    Location("Memphis, TN, USA", 35.1495, -90.0490, "demo-memphis", "Memphis", "TN"),
    Location("Nashville, TN, USA", 36.1627, -86.7816, "demo-nashville", "Nashville", "TN"),
    Location("New York, NY, USA", 40.7128, -74.0060, "demo-new-york", "New York", "NY"),
    Location("Phoenix, AZ, USA", 33.4484, -112.0740, "demo-phoenix", "Phoenix", "AZ"),
    Location("Portland, OR, USA", 45.5152, -122.6784, "demo-portland", "Portland", "OR"),
    Location("Richmond, VA, USA", 37.5407, -77.4360, "demo-richmond", "Richmond", "VA"),
    Location("Seattle, WA, USA", 47.6062, -122.3321, "demo-seattle", "Seattle", "WA"),
)


class DemoRoutingProvider:
    attribution = "Deterministic demo route (replace with Geoapify for road routing)"

    def suggest(self, query: str, *, limit: int = 6) -> list[Location]:
        normalized = query.casefold().strip()
        matches = [location for location in DEMO_LOCATIONS if normalized in location.label.casefold()]
        if matches:
            return matches[:limit]

        # Keeping an offline fallback makes every typed location usable while
        # still producing stable coordinates from one run to the next.
        digest = hashlib.sha256(normalized.encode("utf-8")).digest()
        lat_ratio = int.from_bytes(digest[:4], "big") / (2**32 - 1)
        lon_ratio = int.from_bytes(digest[4:8], "big") / (2**32 - 1)
        label = f"{query.strip()}, USA"
        return [
            Location(
                label=label,
                lat=25.0 + 23.0 * lat_ratio,
                lon=-124.0 + 57.0 * lon_ratio,
                id=f"demo-{digest.hex()[:12]}",
            )
        ]

    def route(self, waypoints: list[Location]) -> RouteResult:
        coordinates: list[tuple[float, float]] = []
        legs: list[RouteLeg] = []
        instructions: list[RouteInstruction] = []
        route_mile = 0.0

        for leg_index, (start, end) in enumerate(zip(waypoints, waypoints[1:])):
            direct_distance = haversine_miles(start.coordinate, end.coordinate)
            distance = direct_distance * 1.15
            duration = distance / 58.0
            leg = RouteLeg(leg_index, start, end, distance, duration)
            legs.append(leg)

            points = 12
            for point_index in range(points + 1):
                if leg_index and point_index == 0:
                    continue
                fraction = point_index / points
                coordinates.append(
                    (
                        start.lon + (end.lon - start.lon) * fraction,
                        start.lat + (end.lat - start.lat) * fraction,
                    )
                )

            instructions.append(
                RouteInstruction(
                    id=f"instruction-{leg_index + 1}",
                    leg_index=leg_index,
                    sequence=leg_index + 1,
                    instruction=f"Drive from {start.label} to {end.label}",
                    distance_miles=distance,
                    duration_minutes=duration * 60,
                    start_mile=route_mile,
                    end_mile=route_mile + distance,
                )
            )
            route_mile += distance

        return RouteResult(
            coordinates=tuple(coordinates),
            legs=tuple(legs),
            instructions=tuple(instructions),
            distance_miles=sum(leg.distance_miles for leg in legs),
            duration_hours=sum(leg.duration_hours for leg in legs),
            attribution=self.attribution,
        )

    def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
        lon, lat = coordinate
        return NearbyPlace("Planned fuel stop", lat, lon)

    def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
        lon, lat = coordinate
        nearest = min(
            DEMO_LOCATIONS,
            key=lambda location: haversine_miles((lon, lat), location.coordinate),
        )
        timezone = _timezone_for_longitude(lon)
        return ReverseLocation(nearest.label, timezone)

    def close(self) -> None:
        return None


def _timezone_for_longitude(lon: float) -> str:
    if lon < -115:
        return "America/Los_Angeles"
    if lon < -101:
        return "America/Denver"
    if lon < -86:
        return "America/Chicago"
    return "America/New_York"
