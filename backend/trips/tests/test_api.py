from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from threading import Lock
from time import sleep

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from trips.domain import DutyEvent, NearbyPlace, ReverseLocation
from trips.providers.base import ProviderError
from trips.providers.demo import DemoRoutingProvider
from trips.service import TripPlannerService


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
    assert sum(log["total_miles"] for log in result["daily_logs"]) == pytest.approx(
        result["summary"]["distance_miles"]
    )
    assert all(
        sum(log["status_totals"].values()) == pytest.approx(24) for log in result["daily_logs"]
    )
    assert all("metadata" not in log for log in result["daily_logs"])
    assert result["metadata"]["main_office_address"] == "100 Main Street, Richmond, VA"
    assert result["metadata"]["home_terminal_address"] == "200 Terminal Road, Richmond, VA"
    assert result["notice"] == "Generated trip plan — not a certified ELD record."
    assert result["attribution"]["map"]


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

    enriched = service._enrich_stops([fuel_event], warnings)

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

    enriched = service._enrich_stops([fuel_event], warnings)

    assert enriched[0] == fuel_event
    assert len(warnings) == 1
    assert "Distant Travel Center" in warnings[0]
    assert "outside the 5-mile fuel-suggestion radius" in warnings[0]
    assert "not added to route" in warnings[0]


def test_optional_stop_enrichment_stops_after_first_provider_failure() -> None:
    class FailingLookupProvider(DemoRoutingProvider):
        def __init__(self) -> None:
            self.lookup_calls: list[str] = []

        def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace:
            self.lookup_calls.append("nearby_fuel")
            raise ProviderError("provider_unavailable", "Optional lookup failed.")

        def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation:
            self.lookup_calls.append("reverse")
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

    enriched = TripPlannerService(provider)._enrich_stops(events, warnings)

    assert enriched == events
    assert provider.lookup_calls == ["nearby_fuel"]
    assert len(warnings) == 1
    assert "remaining optional lookups were skipped" in warnings[0]


def test_optional_stop_enrichment_uses_bounded_concurrency_and_preserves_events() -> None:
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

    enriched = TripPlannerService(provider)._enrich_stops(events, [])

    assert provider.max_in_flight == 4
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


def test_optional_stop_enrichment_deduplicates_identical_lookups() -> None:
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

    enriched = TripPlannerService(provider)._enrich_stops([first, second], [])

    assert provider.reverse_calls == 1
    assert [event.start_location for event in enriched] == [
        "Shared rest location",
        "Shared rest location",
    ]
