from __future__ import annotations

import gzip
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from threading import Event, Lock
from time import sleep

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from trips.domain import (
    DutyEvent,
    Location,
    NearbyPlace,
    ReverseLocation,
    RouteLeg,
    RouteResult,
    route_mile_key,
)
from trips.providers.base import ProviderError
from trips.providers.demo import DemoRoutingProvider
from trips.service import TripPlannerService, _serialized_route_coordinates


def payload() -> dict[str, object]:
    return {
        "current_location": {
            "id": "richmond",
            "label": "Richmond, VA, USA",
            "lat": 37.5407,
            "lon": -77.4360,
        },
        "pickup_location": {
            "id": "nashville",
            "label": "Nashville, TN, USA",
            "lat": 36.1627,
            "lon": -86.7816,
        },
        "dropoff_location": {
            "id": "dallas",
            "label": "Dallas, TX, USA",
            "lat": 32.7767,
            "lon": -96.7970,
        },
        "current_cycle_used_hours": 18.5,
        "departure_at": "2026-08-25T06:00",
        "home_terminal_timezone": "America/New_York",
        "metadata": {
            "driver_name": "Alex Morgan",
            "carrier_name": "Spotter Transport",
            "main_office_address": "100 Main Street, Richmond, VA",
            "home_terminal_address": "200 Terminal Road, Richmond, VA",
            "vehicle_number": "TRK-204",
            "shipping_document_number": "BOL-9001",
        },
    }


@override_settings(USE_DEMO_PROVIDER=True)
def test_health_and_location_suggestions() -> None:
    client = APIClient()

    health = client.get("/api/v1/health", HTTP_ORIGIN="http://127.0.0.1:5173")
    suggestions = client.get("/api/v1/locations/suggest", {"q": "Dallas"})

    assert health.status_code == 200
    assert health.json()["provider"] == "demo"
    assert health.json()["configured"] is True
    assert health["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert suggestions.status_code == 200
    assert suggestions.json()["suggestions"][0]["label"] == "Dallas, TX, USA"
    assert "s-maxage=300" in suggestions["cache-control"]


def test_location_suggestions_are_cached_by_normalized_query() -> None:
    class CountingProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.queries: list[str] = []

        def suggest(self, query: str, *, limit: int = 6) -> list[Location]:
            self.queries.append(query)
            return super().suggest(query, limit=limit)

    cache.clear()
    provider = CountingProvider()
    service = TripPlannerService(provider)

    first = service.suggest("  New   York ")
    second = service.suggest("new york")

    assert first == second
    assert provider.queries == ["New York"]


def test_auto_timezone_lookup_and_route_request_run_concurrently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class CoordinatedProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.route_started = Event()
            self.timezone_started = Event()

        def route(self, waypoints: list[Location]) -> RouteResult:
            self.route_started.set()
            assert self.timezone_started.wait(1), "timezone lookup did not overlap routing"
            return super().route(waypoints)

        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            if coordinate == (-77.436, 37.5407):
                self.timezone_started.set()
                assert self.route_started.wait(1), "routing did not overlap timezone lookup"
            return super().reverse(coordinate)

    provider = CoordinatedProvider()
    monkeypatch.setattr("trips.service.get_provider", lambda: provider)
    request_payload = payload()
    request_payload.pop("home_terminal_timezone")

    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 201
    assert provider.route_started.is_set()
    assert provider.timezone_started.is_set()


@override_settings(USE_DEMO_PROVIDER=True)
def test_trip_plan_response_supports_gzip() -> None:
    response = APIClient().post(
        "/api/v1/trip-plans",
        payload(),
        format="json",
        HTTP_ACCEPT_ENCODING="gzip",
    )

    assert response.status_code == 201
    assert response["content-encoding"] == "gzip"
    decoded = json.loads(gzip.decompress(response.content))
    assert decoded["route"]["geometry"]["type"] == "LineString"


def test_serialized_route_geometry_is_simplified_per_leg() -> None:
    current = Location("Current", 35.0, -100.0)
    pickup = Location("Pickup", 36.0, -90.0)
    dropoff = Location("Drop-off", 35.0, -80.0)
    first_path = tuple((-100.0 + index / 100, 35.0 + index / 1000) for index in range(1001))
    second_path = tuple((-90.0 + index / 100, 36.0 - index / 1000) for index in range(1001))
    route = RouteResult(
        coordinates=first_path + second_path[1:],
        legs=(
            RouteLeg(0, current, pickup, 600, 10),
            RouteLeg(1, pickup, dropoff, 600, 10),
        ),
        instructions=(),
        distance_miles=1200,
        duration_hours=20,
        attribution="Test",
        leg_coordinates=(first_path, second_path),
    )

    serialized = _serialized_route_coordinates(route)

    assert serialized == (current.coordinate, pickup.coordinate, dropoff.coordinate)
    assert len(route.coordinates) == 2001


@override_settings(USE_DEMO_PROVIDER=True)
def test_create_plan_contract_and_invariants() -> None:
    response = APIClient().post("/api/v1/trip-plans", payload(), format="json")

    assert response.status_code == 201
    result = response.json()
    assert result["route"]["type"] == "Feature"
    assert result["route"]["geometry"]["type"] == "LineString"
    assert result["summary"]["departure_at"] == "2026-08-25T10:00:00Z"
    assert result["summary"]["distance_miles"] > 0
    assert result["instructions"]
    assert result["stops"]
    assert [stop["sequence"] for stop in result["stops"]] == list(
        range(1, len(result["stops"]) + 1)
    )
    assert result["summary"]["stop_count"] == len(result["stops"])
    assert any(event["event_type"] == "pretrip_inspection" for event in result["duty_events"])
    assert all(stop["type"] != "pretrip_inspection" for stop in result["stops"])
    standalone_meal_stops = [stop for stop in result["stops"] if stop["type"] == "meal_break"]
    assert standalone_meal_stops
    assert all(stop["duration_minutes"] == 30 for stop in standalone_meal_stops)
    event_index = {event["id"]: index for index, event in enumerate(result["duty_events"])}
    rest_stops = [stop for stop in result["stops"] if stop["type"] == "rest"]
    assert rest_stops
    for stop in rest_stops:
        rest_index = event_index[stop["id"]]
        meal_event = result["duty_events"][rest_index - 1]
        rest_event = result["duty_events"][rest_index]
        assert meal_event["event_type"] == "meal_break"
        assert meal_event["status"] == "off_duty"
        assert meal_event["duration_hours"] == 1
        assert rest_event["status"] == "sleeper_berth"
        assert rest_event["duration_hours"] == 9
        assert stop["scheduled_at"] == meal_event["start_at"]
        assert stop["duration_minutes"] == 600
        assert "Off Duty" in stop["reason"]
        assert "Sleeper Berth" in stop["reason"]
    assert sum(log["total_miles"] for log in result["daily_logs"]) == pytest.approx(
        result["summary"]["distance_miles"]
    )
    assert all(
        sum(log["status_totals"].values()) == pytest.approx(24) for log in result["daily_logs"]
    )
    for log in result["daily_logs"]:
        recap = log["recap"]
        assert recap["seventy_hour_a"] == recap["cycle_used_at_end"]
        assert recap["seventy_hour_b"] == pytest.approx(max(0, 70 - recap["seventy_hour_a"]))
        assert recap["seventy_hour_c"] == recap["cycle_used_at_end"]
        assert recap["estimated"] is True
        assert "Conservative 70-hour/8-day estimate" in recap["estimate_basis"]
    assert all("metadata" not in log for log in result["daily_logs"])
    assert result["metadata"]["main_office_address"] == "100 Main Street, Richmond, VA"
    assert result["metadata"]["home_terminal_address"] == "200 Terminal Road, Richmond, VA"
    assert result["notice"] == "Generated trip plan — not a certified ELD record."
    assert (
        "Each scheduled fuel stop is modeled as 30 minutes On Duty—not driving."
        in result["assumptions"]
    )
    assert any(
        "70-hour/8-day paper recap is a conservative estimate" in warning
        for warning in result["warnings"]
    )
    assert all("cannot be reconstructed" not in warning for warning in result["warnings"])
    assert result["attribution"]["map"]
    public_locations = [
        *(event["start_location"] for event in result["duty_events"]),
        *(event["end_location"] for event in result["duty_events"]),
        *(stop["label"] for stop in result["stops"]),
        *(log["from_location"] for log in result["daily_logs"]),
        *(log["to_location"] for log in result["daily_logs"]),
        *(remark["location"] for log in result["daily_logs"] for remark in log["remarks"]),
    ]
    assert all(not location.startswith("Route mile ") for location in public_locations)


@override_settings(USE_DEMO_PROVIDER=False, GEOAPIFY_API_KEY="")
def test_health_reports_an_unconfigured_live_provider() -> None:
    response = APIClient().get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_configured",
        "service": "spotter-route-eld-api",
        "provider": "geoapify",
        "configured": False,
    }


@override_settings(USE_DEMO_PROVIDER=True)
def test_timezone_is_detected_when_omitted_and_naive_time_uses_it() -> None:
    request_payload = payload()
    request_payload.pop("home_terminal_timezone")
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 201
    assert response.json()["summary"]["home_terminal_timezone"] == "America/New_York"
    assert response.json()["summary"]["departure_at"] == "2026-08-25T10:00:00Z"


@pytest.mark.parametrize(
    ("change", "expected_field"),
    [
        ({"current_cycle_used_hours": 70.1}, "current_cycle_used_hours"),
        ({"current_cycle_used_hours": "NaN"}, "current_cycle_used_hours"),
        ({"home_terminal_timezone": "Mars/Olympus_Mons"}, "home_terminal_timezone"),
        ({"home_terminal_timezone": "../UTC"}, "home_terminal_timezone"),
        ({"departure_at": "not-a-date"}, "departure_at"),
        (
            {"metadata": {"main_office_address": "x" * 201}},
            "metadata.main_office_address",
        ),
        (
            {
                "current_location": {
                    "label": "Invalid coordinate",
                    "lat": "NaN",
                    "lon": -77.4360,
                }
            },
            "current_location.lat",
        ),
        (
            {
                "dropoff_location": {
                    "label": "Same place",
                    "lat": 37.5407,
                    "lon": -77.4360,
                }
            },
            "dropoff_location",
        ),
    ],
)
@override_settings(USE_DEMO_PROVIDER=True)
def test_validation_errors_have_stable_envelope(
    change: dict[str, object], expected_field: str
) -> None:
    request_payload = payload()
    request_payload.update(change)
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 400
    assert response.json()["error"] == {
        "code": "validation_error",
        "message": response.json()["error"]["message"],
        "field": expected_field,
        "retryable": False,
    }


@pytest.mark.parametrize(
    ("duplicate_field", "source_field", "expected_field", "expected_message"),
    [
        (
            "pickup_location",
            "current_location",
            "pickup_location",
            "Pickup location must differ from current location.",
        ),
        (
            "dropoff_location",
            "current_location",
            "dropoff_location",
            "Drop-off location must differ from current location.",
        ),
        (
            "dropoff_location",
            "pickup_location",
            "dropoff_location",
            "Drop-off location must differ from pickup location.",
        ),
    ],
)
@override_settings(USE_DEMO_PROVIDER=True)
def test_duplicate_locations_are_owned_by_the_field_that_repeats_an_earlier_stop(
    duplicate_field: str,
    source_field: str,
    expected_field: str,
    expected_message: str,
) -> None:
    request_payload = payload()
    source_location = request_payload[source_field]
    assert isinstance(source_location, dict)
    request_payload[duplicate_field] = {
        **source_location,
        "id": f"duplicate-{duplicate_field}",
        "label": "Same place",
    }

    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 400
    assert response.json()["error"] == {
        "code": "validation_error",
        "message": expected_message,
        "field": expected_field,
        "retryable": False,
    }


@override_settings(USE_DEMO_PROVIDER=True)
def test_nonexistent_local_departure_time_is_rejected() -> None:
    request_payload = payload()
    request_payload["departure_at"] = "2026-03-08T02:30"
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 400
    assert response.json()["error"]["field"] == "departure_at"
    assert "does not exist" in response.json()["error"]["message"]


@override_settings(USE_DEMO_PROVIDER=True)
def test_ambiguous_local_departure_time_requires_an_explicit_offset() -> None:
    request_payload = payload()
    request_payload["departure_at"] = "2026-11-01T01:30"
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 400
    assert response.json()["error"]["field"] == "departure_at"
    assert "occurs twice" in response.json()["error"]["message"]
    assert "explicit UTC offset" in response.json()["error"]["message"]


@override_settings(USE_DEMO_PROVIDER=True)
def test_auto_detected_timezone_rejects_ambiguous_local_departure_time() -> None:
    request_payload = payload()
    request_payload.pop("home_terminal_timezone")
    request_payload["departure_at"] = "2026-11-01T01:30"
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 400
    assert response.json()["error"]["field"] == "departure_at"
    assert "occurs twice" in response.json()["error"]["message"]


@pytest.mark.parametrize(
    ("departure_at", "expected_utc"),
    [
        ("2026-11-01T01:30:00-04:00", "2026-11-01T05:30:00Z"),
        ("2026-11-01T01:30:00-05:00", "2026-11-01T06:30:00Z"),
    ],
)
@override_settings(USE_DEMO_PROVIDER=True)
def test_ambiguous_clock_time_with_explicit_offset_is_accepted(
    departure_at: str, expected_utc: str
) -> None:
    request_payload = payload()
    request_payload["departure_at"] = departure_at
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 201
    assert response.json()["summary"]["departure_at"] == expected_utc


@override_settings(USE_DEMO_PROVIDER=True)
def test_explicit_offset_is_accepted_with_auto_detected_timezone() -> None:
    request_payload = payload()
    request_payload.pop("home_terminal_timezone")
    request_payload["departure_at"] = "2026-11-01T01:30:00-05:00"
    response = APIClient().post("/api/v1/trip-plans", request_payload, format="json")

    assert response.status_code == 201
    assert response.json()["summary"]["departure_at"] == "2026-11-01T06:30:00Z"
    assert response.json()["summary"]["home_terminal_timezone"] == "America/New_York"


@override_settings(USE_DEMO_PROVIDER=True)
def test_short_suggestion_query_is_rejected() -> None:
    response = APIClient().get("/api/v1/locations/suggest", {"q": "a"})

    assert response.status_code == 400
    assert response.json()["error"]["field"] == "q"


@override_settings(USE_DEMO_PROVIDER=True)
def test_location_suggestions_are_throttled_with_the_stable_error_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        ScopedRateThrottle,
        "THROTTLE_RATES",
        {"location_suggest": "1/minute", "trip_plan": "30/hour"},
    )
    cache.clear()

    client = APIClient()
    first = client.get("/api/v1/locations/suggest", {"q": "Dallas"})
    second = client.get("/api/v1/locations/suggest", {"q": "Austin"})

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "throttled"
    assert second.json()["error"]["retryable"] is True


def test_provider_quota_error_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    class QuotaProvider(DemoRoutingProvider):
        def route(self, waypoints: object) -> object:
            raise ProviderError(
                "provider_quota_exceeded",
                "The routing service quota has been reached. Try again later.",
                retryable=True,
                status_code=503,
            )

    monkeypatch.setattr("trips.service.get_provider", lambda: QuotaProvider())
    response = APIClient().post("/api/v1/trip-plans", payload(), format="json")

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "provider_quota_exceeded",
        "message": "The routing service quota has been reached. Try again later.",
        "field": None,
        "retryable": True,
    }


def test_required_location_failure_is_returned_instead_of_route_mile_logs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RequiredLocationFailureProvider(DemoRoutingProvider):
        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            raise ProviderError(
                "provider_unavailable",
                "Duty-change location lookup failed. Try again.",
                retryable=True,
                status_code=503,
            )

    monkeypatch.setattr(
        "trips.service.get_provider",
        lambda: RequiredLocationFailureProvider(),
    )
    response = APIClient().post("/api/v1/trip-plans", payload(), format="json")

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "provider_unavailable",
        "message": "Duty-change location lookup failed. Try again.",
        "field": None,
        "retryable": True,
    }


def test_nearby_fuel_is_a_suggestion_and_does_not_move_route_event() -> None:
    class SuggestionProvider(DemoRoutingProvider):
        def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
            return NearbyPlace("Nearby Travel Center", 35.02, -99.98)

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    route_coordinate = (-100.0, 35.0)
    fuel_event = DutyEvent(
        id="fuel-1",
        status="on_duty",
        event_type="fuel",
        start_at=start,
        end_at=start + timedelta(minutes=30),
        start_location="Route mile 950",
        end_location="Route mile 950",
        start_coordinates=route_coordinate,
        end_coordinates=route_coordinate,
        start_mile=950,
        end_mile=950,
        miles_driven=0,
        note="Fuel stop scheduled before 1,000 miles.",
    )
    service = TripPlannerService(SuggestionProvider())
    warnings: list[str] = []

    enriched = service._enrich_fuel_suggestions([fuel_event], warnings)

    assert enriched[0].start_coordinates == route_coordinate
    assert enriched[0].end_coordinates == route_coordinate
    assert enriched[0].start_location == "Route mile 950"
    assert "Nearby fuel suggestion: Nearby Travel Center" in enriched[0].note
    assert "mi from the scheduled route point" in enriched[0].note
    assert "not added to route" in enriched[0].note
    assert warnings == []


def test_distant_fuel_suggestion_is_ignored_with_warning() -> None:
    class DistantSuggestionProvider(DemoRoutingProvider):
        def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
            return NearbyPlace("Distant Travel Center", 35.4, -99.6)

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    route_coordinate = (-100.0, 35.0)
    fuel_event = DutyEvent(
        id="fuel-1",
        status="on_duty",
        event_type="fuel",
        start_at=start,
        end_at=start + timedelta(minutes=30),
        start_location="Route mile 950",
        end_location="Route mile 950",
        start_coordinates=route_coordinate,
        end_coordinates=route_coordinate,
        start_mile=950,
        end_mile=950,
        miles_driven=0,
        note="Fuel stop scheduled before 1,000 miles.",
    )
    service = TripPlannerService(DistantSuggestionProvider())
    warnings: list[str] = []

    enriched = service._enrich_fuel_suggestions([fuel_event], warnings)

    assert enriched[0] == fuel_event
    assert len(warnings) == 1
    assert "Distant Travel Center" in warnings[0]
    assert "outside the 5-mile fuel-suggestion radius" in warnings[0]
    assert "not added to route" in warnings[0]


def test_optional_fuel_enrichment_stops_after_first_provider_failure() -> None:
    class FailingLookupProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.lookup_calls: list[str] = []

        def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
            self.lookup_calls.append("nearby_fuel")
            raise ProviderError("provider_unavailable", "Optional lookup failed.")

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    route_coordinate = (-100.0, 35.0)
    fuel_event = DutyEvent(
        id="fuel-1",
        status="on_duty",
        event_type="fuel",
        start_at=start,
        end_at=start + timedelta(minutes=30),
        start_location="Route mile 950",
        end_location="Route mile 950",
        start_coordinates=route_coordinate,
        end_coordinates=route_coordinate,
        start_mile=950,
        end_mile=950,
        miles_driven=0,
        note="Fuel stop scheduled before 1,000 miles.",
    )
    rest_event = replace(
        fuel_event,
        id="rest-1",
        status="off_duty",
        event_type="rest",
        start_at=fuel_event.end_at,
        end_at=fuel_event.end_at + timedelta(hours=10),
        note="Ten-hour rest.",
    )
    break_event = replace(
        fuel_event,
        id="break-1",
        status="off_duty",
        event_type="break",
        start_at=rest_event.end_at,
        end_at=rest_event.end_at + timedelta(minutes=30),
        note="Thirty-minute break.",
    )
    events = [fuel_event, rest_event, break_event]
    provider = FailingLookupProvider()
    warnings: list[str] = []

    enriched = TripPlannerService(provider)._enrich_fuel_suggestions(events, warnings)

    assert enriched == events
    assert provider.lookup_calls == ["nearby_fuel"]
    assert len(warnings) == 1
    assert "fuel lookups were skipped" in warnings[0]


def test_required_location_enrichment_uses_bounded_concurrency_and_preserves_events() -> None:
    class DelayedLookupProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.in_flight = 0
            self.max_in_flight = 0
            self.lock = Lock()

        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            with self.lock:
                self.in_flight += 1
                self.max_in_flight = max(self.max_in_flight, self.in_flight)
            sleep(0.03)
            with self.lock:
                self.in_flight -= 1
            lon, lat = coordinate
            return ReverseLocation(f"Stop {lon:.1f}, {lat:.1f}")

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    base = DutyEvent(
        id="rest-0",
        status="off_duty",
        event_type="rest",
        start_at=start,
        end_at=start + timedelta(hours=10),
        start_location="Route mile 100",
        end_location="Route mile 100",
        start_coordinates=(-100.0, 35.0),
        end_coordinates=(-100.0, 35.0),
        start_mile=100,
        end_mile=100,
        miles_driven=0,
        note="Ten-hour rest.",
    )
    events = [
        replace(
            base,
            id=f"rest-{index}",
            start_at=start + timedelta(hours=index * 10),
            end_at=start + timedelta(hours=(index + 1) * 10),
            start_coordinates=(-100.0 - index, 35.0 + index),
            end_coordinates=(-100.0 - index, 35.0 + index),
            start_mile=100 + index * 100,
            end_mile=100 + index * 100,
        )
        for index in range(5)
    ]
    provider = DelayedLookupProvider()

    points = {route_mile_key(event.start_mile): event.start_coordinates for event in events}
    enriched, resolved = TripPlannerService(provider)._resolve_duty_locations(
        events,
        points,
    )

    assert provider.max_in_flight == 4
    assert len(resolved) == len(points)
    assert [event.id for event in enriched] == [event.id for event in events]
    for original, result in zip(events, enriched, strict=True):
        assert result.start_at == original.start_at
        assert result.end_at == original.end_at
        assert result.status == original.status
        assert result.start_coordinates == original.start_coordinates
        assert result.end_coordinates == original.end_coordinates
        assert result.start_mile == original.start_mile
        assert result.end_mile == original.end_mile
        assert result.start_location.startswith("Stop ")


def test_required_location_enrichment_deduplicates_identical_lookups() -> None:
    class CountingLookupProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.reverse_calls = 0

        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            self.reverse_calls += 1
            return ReverseLocation("Shared rest location")

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    first = DutyEvent(
        id="rest-1",
        status="off_duty",
        event_type="rest",
        start_at=start,
        end_at=start + timedelta(hours=10),
        start_location="Route mile 500",
        end_location="Route mile 500",
        start_coordinates=(-100.0, 35.0),
        end_coordinates=(-100.0, 35.0),
        start_mile=500,
        end_mile=500,
        miles_driven=0,
        note="Ten-hour rest.",
    )
    second = replace(
        first,
        id="rest-2",
        start_at=first.end_at,
        end_at=first.end_at + timedelta(hours=10),
    )
    provider = CountingLookupProvider()

    points = {route_mile_key(first.start_mile): first.start_coordinates}
    enriched, resolved = TripPlannerService(provider)._resolve_duty_locations(
        [first, second],
        points,
    )

    assert provider.reverse_calls == 1
    assert resolved == {500.0: "Shared rest location"}
    assert [event.start_location for event in enriched] == [
        "Shared rest location",
        "Shared rest location",
    ]


def test_resolved_fuel_location_propagates_across_adjacent_driving_events() -> None:
    class FuelLocationProvider(DemoRoutingProvider):
        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            return ReverseLocation("Amarillo, TX")

        def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
            lon, lat = coordinate
            return NearbyPlace("Roadrunner Travel Center", lat, lon)

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    stop_coordinate = (-101.8313, 35.222)
    first_drive = DutyEvent(
        id="drive-1",
        status="driving",
        event_type="driving",
        start_at=start,
        end_at=start + timedelta(hours=8),
        start_location="Richmond, VA",
        end_location="Route mile 950",
        start_coordinates=(-77.436, 37.5407),
        end_coordinates=stop_coordinate,
        start_mile=0,
        end_mile=950,
        miles_driven=950,
        note="Drive west.",
    )
    fuel = DutyEvent(
        id="fuel-1",
        status="on_duty",
        event_type="fuel",
        start_at=first_drive.end_at,
        end_at=first_drive.end_at + timedelta(minutes=30),
        start_location="Route mile 950",
        end_location="Route mile 950",
        start_coordinates=stop_coordinate,
        end_coordinates=stop_coordinate,
        start_mile=950,
        end_mile=950,
        miles_driven=0,
        note="Fuel stop.",
    )
    second_drive = replace(
        first_drive,
        id="drive-2",
        start_at=fuel.end_at,
        end_at=fuel.end_at + timedelta(hours=2),
        start_location="Route mile 950",
        end_location="Dallas, TX",
        start_coordinates=stop_coordinate,
        end_coordinates=(-96.797, 32.7767),
        start_mile=950,
        end_mile=1100,
        miles_driven=150,
    )
    events = [first_drive, fuel, second_drive]
    provider = FuelLocationProvider()
    service = TripPlannerService(provider)

    resolved_events, labels = service._resolve_duty_locations(
        events,
        {950.0: stop_coordinate},
    )
    enriched = service._enrich_fuel_suggestions(resolved_events, [])

    assert labels == {950.0: "Amarillo, TX"}
    assert enriched[0].end_location == "Amarillo, TX"
    assert enriched[1].start_location == enriched[1].end_location == "Amarillo, TX"
    assert enriched[2].start_location == "Amarillo, TX"
    assert enriched[1].start_coordinates == stop_coordinate
    assert enriched[1].end_coordinates == stop_coordinate
    assert "Nearby fuel suggestion: Roadrunner Travel Center" in enriched[1].note
    assert [event.id for event in enriched] == [event.id for event in events]
    assert [event.start_at for event in enriched] == [event.start_at for event in events]
    assert [event.end_at for event in enriched] == [event.end_at for event in events]
    assert [event.miles_driven for event in enriched] == [event.miles_driven for event in events]


def test_required_and_optional_lookups_share_one_concurrency_pool() -> None:
    class CoordinatedProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.reverse_started = Event()
            self.fuel_started = Event()

        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            self.reverse_started.set()
            assert self.fuel_started.wait(1), "fuel lookup did not overlap reverse lookup"
            return ReverseLocation("Amarillo, TX")

        def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
            self.fuel_started.set()
            assert self.reverse_started.wait(1), "reverse lookup did not overlap fuel lookup"
            lon, lat = coordinate
            return NearbyPlace("Roadrunner Travel Center", lat, lon)

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    coordinate = (-101.8313, 35.222)
    fuel = DutyEvent(
        id="fuel-1",
        status="on_duty",
        event_type="fuel",
        start_at=start,
        end_at=start + timedelta(minutes=30),
        start_location="Route mile 950",
        end_location="Route mile 950",
        start_coordinates=coordinate,
        end_coordinates=coordinate,
        start_mile=950,
        end_mile=950,
        miles_driven=0,
        note="Fuel stop.",
    )
    provider = CoordinatedProvider()

    enriched, resolved = TripPlannerService(provider)._enrich_provider_locations(
        [fuel],
        {950.0: coordinate},
        [],
    )

    assert provider.reverse_started.is_set()
    assert provider.fuel_started.is_set()
    assert resolved == {950.0: "Amarillo, TX"}
    assert enriched[0].start_location == "Amarillo, TX"
    assert "Roadrunner Travel Center" in enriched[0].note


def test_required_duty_locations_are_not_limited_to_optional_lookup_cap() -> None:
    class CountingProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.reverse_calls = 0
            self.lock = Lock()

        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            with self.lock:
                self.reverse_calls += 1
            lon, _lat = coordinate
            return ReverseLocation(f"City {abs(lon):.0f}, TX")

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    events = [
        DutyEvent(
            id=f"rest-{index}",
            status="off_duty",
            event_type="rest",
            start_at=start + timedelta(hours=index * 10),
            end_at=start + timedelta(hours=(index + 1) * 10),
            start_location=f"Route mile {100 + index}",
            end_location=f"Route mile {100 + index}",
            start_coordinates=(-90.0 - index, 35.0),
            end_coordinates=(-90.0 - index, 35.0),
            start_mile=100 + index,
            end_mile=100 + index,
            miles_driven=0,
            note="Ten-hour rest.",
        )
        for index in range(13)
    ]
    points = {route_mile_key(event.start_mile): event.start_coordinates for event in events}
    provider = CountingProvider()
    enriched, resolved = TripPlannerService(provider)._resolve_duty_locations(
        events,
        points,
    )

    assert provider.reverse_calls == 13
    assert len(resolved) == 13
    assert all(not event.start_location.startswith("Route mile ") for event in enriched)


def test_required_location_failure_prevents_noncompliant_log_output() -> None:
    class FailingProvider(DemoRoutingProvider):
        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            raise ProviderError("provider_unavailable", "Reverse lookup failed.")

    start = datetime(2026, 8, 25, 12, tzinfo=UTC)
    event = DutyEvent(
        id="rest-1",
        status="off_duty",
        event_type="rest",
        start_at=start,
        end_at=start + timedelta(hours=10),
        start_location="Route mile 500",
        end_location="Route mile 500",
        start_coordinates=(-100.0, 35.0),
        end_coordinates=(-100.0, 35.0),
        start_mile=500,
        end_mile=500,
        miles_driven=0,
        note="Ten-hour rest.",
    )
    with pytest.raises(ProviderError) as raised:
        TripPlannerService(FailingProvider())._resolve_duty_locations(
            [event],
            {500.0: event.start_coordinates},
        )

    assert raised.value.code == "provider_unavailable"
