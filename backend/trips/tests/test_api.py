from __future__ import annotations

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from trips.providers.base import ProviderError
from trips.providers.demo import DemoRoutingProvider


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
            "vehicle_number": "TRK-204",
            "shipping_document_number": "BOL-9001",
        },
    }


@override_settings(USE_DEMO_PROVIDER=True)
def test_health_and_location_suggestions() -> None:
    client = APIClient()

    health = client.get(
        "/api/v1/health", HTTP_ORIGIN="http://127.0.0.1:5173"
    )
    suggestions = client.get("/api/v1/locations/suggest", {"q": "Dallas"})

    assert health.status_code == 200
    assert health.json()["provider"] == "demo"
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
        sum(log["status_totals"].values()) == pytest.approx(24)
        for log in result["daily_logs"]
    )
    assert all(log["metadata"]["driver_name"] == "Alex Morgan" for log in result["daily_logs"])
    assert result["notice"] == "Generated trip plan — not a certified ELD record."
    assert result["attribution"]["map"]


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
        ({"home_terminal_timezone": "Mars/Olympus_Mons"}, "home_terminal_timezone"),
        ({"departure_at": "not-a-date"}, "departure_at"),
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
def test_short_suggestion_query_is_rejected() -> None:
    response = APIClient().get("/api/v1/locations/suggest", {"q": "a"})

    assert response.status_code == 400
    assert response.json()["error"]["field"] == "q"


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
