from __future__ import annotations

import httpx
import pytest

from trips.domain import Location
from trips.providers.base import ProviderError
from trips.providers.geoapify import (
    GeoapifyRoutingProvider,
    _close_shared_clients,
)


def test_autocomplete_is_normalized_and_restricted_to_us_results() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["filter"] == "countrycode:us"
        assert request.url.params["apiKey"] == "test-key"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "place_id": "place-1",
                        "formatted": "Dallas, TX, USA",
                        "lat": 32.7767,
                        "lon": -96.797,
                        "city": "Dallas",
                        "state_code": "TX",
                        "country": "United States",
                    }
                ]
            },
        )

    provider = GeoapifyRoutingProvider("test-key", transport=httpx.MockTransport(handler))
    try:
        suggestions = provider.suggest("Dallas")
    finally:
        provider.client.close()

    assert suggestions[0].id == "place-1"
    assert suggestions[0].label == "Dallas, TX, USA"


def test_default_providers_reuse_the_warm_process_http_client() -> None:
    _close_shared_clients()
    first = GeoapifyRoutingProvider("first-key", timeout=7)
    second = GeoapifyRoutingProvider("second-key", timeout=7)
    try:
        assert first.client is second.client
        first.close()
        assert first.client.is_closed is False
    finally:
        _close_shared_clients()


def test_heavy_truck_route_and_instructions_are_normalized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["mode"] == "heavy_truck"
        assert request.url.params["waypoints"] == "35.0,-90.0|36.0,-100.0|37.0,-110.0"
        return httpx.Response(
            200,
            json={
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "MultiLineString",
                            "coordinates": [
                                [[-90, 35], [-100, 36]],
                                [[-100, 36], [-110, 37]],
                            ],
                        },
                        "properties": {
                            "distance": 321868.8,
                            "time": 14400,
                            "legs": [
                                {
                                    "distance": 160934.4,
                                    "time": 7200,
                                    "steps": [
                                        {
                                            "distance": 160934.4,
                                            "time": 7200,
                                            "instruction": {"text": "Head west"},
                                        }
                                    ],
                                },
                                {
                                    "distance": 160934.4,
                                    "time": 7200,
                                    "steps": [
                                        {
                                            "distance": 160934.4,
                                            "time": 7200,
                                            "instruction": {"text": "Continue west"},
                                        }
                                    ],
                                },
                            ],
                        },
                    }
                ],
            },
        )

    provider = GeoapifyRoutingProvider("test-key", transport=httpx.MockTransport(handler))
    waypoints = [
        Location("Current", 35, -90),
        Location("Pickup", 36, -100),
        Location("Drop-off", 37, -110),
    ]
    try:
        route = provider.route(waypoints)
    finally:
        provider.client.close()

    assert route.distance_miles == pytest.approx(200)
    assert route.duration_hours == pytest.approx(4)
    assert route.coordinates == ((-90.0, 35.0), (-100.0, 36.0), (-110.0, 37.0))
    assert route.leg_coordinates == (
        ((-90.0, 35.0), (-100.0, 36.0)),
        ((-100.0, 36.0), (-110.0, 37.0)),
    )
    assert [instruction.instruction for instruction in route.instructions] == [
        "Head west",
        "Continue west",
    ]


def test_leg_geometry_requires_one_multiline_path_per_leg() -> None:
    mismatched = {
        "type": "MultiLineString",
        "coordinates": [
            [[-90, 35], [-95, 35.5]],
            [[-95, 35.5], [-100, 36]],
            [[-100, 36], [-110, 37]],
        ],
    }
    line_string = {
        "type": "LineString",
        "coordinates": [[-90, 35], [-100, 36], [-110, 37]],
    }

    assert GeoapifyRoutingProvider._leg_coordinates_from_geometry(mismatched, 2) == ()
    assert GeoapifyRoutingProvider._leg_coordinates_from_geometry(line_string, 2) == ()


def test_transient_failure_is_retried_once() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, json={"message": "temporary"})
        return httpx.Response(200, json={"results": []})

    provider = GeoapifyRoutingProvider("test-key", transport=httpx.MockTransport(handler))
    try:
        assert provider.suggest("Dallas") == []
    finally:
        provider.client.close()
    assert calls == 2


def test_quota_error_is_typed_and_retryable() -> None:
    provider = GeoapifyRoutingProvider(
        "test-key",
        transport=httpx.MockTransport(lambda request: httpx.Response(429, json={})),
    )
    try:
        with pytest.raises(ProviderError) as raised:
            provider.suggest("Dallas")
    finally:
        provider.client.close()

    assert raised.value.code == "provider_quota_exceeded"
    assert raised.value.retryable is True
    assert raised.value.status_code == 503


def test_repeated_timeout_is_normalized_after_one_retry() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("timed out", request=request)

    provider = GeoapifyRoutingProvider("test-key", transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(ProviderError) as raised:
            provider.suggest("Dallas")
    finally:
        provider.client.close()

    assert calls == 2
    assert raised.value.code == "provider_unavailable"
    assert raised.value.retryable is True


def test_remote_protocol_failure_is_normalized_after_one_retry() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError("invalid upstream response", request=request)

    provider = GeoapifyRoutingProvider("test-key", transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(ProviderError) as raised:
            provider.suggest("Dallas")
    finally:
        provider.close()

    assert calls == 2
    assert raised.value.code == "provider_unavailable"
    assert raised.value.retryable is True


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {"results": [{"formatted": "Missing coordinates"}]},
        {"results": "not-a-list"},
    ],
)
def test_malformed_autocomplete_payload_is_normalized(payload: object) -> None:
    provider = GeoapifyRoutingProvider(
        "test-key",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload)),
    )
    try:
        with pytest.raises(ProviderError) as raised:
            provider.suggest("Dallas")
    finally:
        provider.close()

    assert raised.value.code == "invalid_provider_response"


def test_empty_route_result_becomes_route_not_found() -> None:
    provider = GeoapifyRoutingProvider(
        "test-key",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"type": "FeatureCollection", "features": []})
        ),
    )
    waypoints = [
        Location("Current", 35, -90),
        Location("Pickup", 36, -100),
        Location("Drop-off", 37, -110),
    ]
    try:
        with pytest.raises(ProviderError) as raised:
            provider.route(waypoints)
    finally:
        provider.client.close()

    assert raised.value.code == "route_not_found"
    assert raised.value.status_code == 422


def test_partial_route_legs_are_rejected() -> None:
    provider = GeoapifyRoutingProvider(
        "test-key",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "features": [
                        {
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [[-90, 35], [-100, 36], [-110, 37]],
                            },
                            "properties": {
                                "distance": 321868.8,
                                "time": 14400,
                                "legs": [{"distance": 160934.4, "time": 7200}],
                            },
                        }
                    ]
                },
            )
        ),
    )
    waypoints = [
        Location("Current", 35, -90),
        Location("Pickup", 36, -100),
        Location("Drop-off", 37, -110),
    ]
    try:
        with pytest.raises(ProviderError) as raised:
            provider.route(waypoints)
    finally:
        provider.close()

    assert raised.value.code == "invalid_provider_response"


def test_fuel_and_reverse_lookup_contracts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v2/places":
            assert request.url.params["filter"] == "circle:-100,35,8000"
            return httpx.Response(
                200,
                json={
                    "features": [
                        {
                            "properties": {
                                "name": "Roadrunner Travel Center",
                                "lat": 35.1,
                                "lon": -100.2,
                            }
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "formatted": "Amarillo, TX, USA",
                        "timezone": {"name": "America/Chicago"},
                    }
                ]
            },
        )

    provider = GeoapifyRoutingProvider("test-key", transport=httpx.MockTransport(handler))
    try:
        fuel = provider.nearby_fuel((-100, 35))
        reverse = provider.reverse((-100, 35))
    finally:
        provider.client.close()

    assert fuel.label == "Roadrunner Travel Center"
    assert reverse.label == "Amarillo, TX, USA"
    assert reverse.timezone == "America/Chicago"
