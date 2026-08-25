"""Routing provider interface and normalized errors."""

from __future__ import annotations

from typing import Protocol

from trips.domain import Location, NearbyPlace, ReverseLocation, RouteResult


class ProviderError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        status_code: int = 502,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.status_code = status_code


class RoutingProvider(Protocol):
    attribution: str

    def suggest(self, query: str, *, limit: int = 6) -> list[Location]: ...

    def route(self, waypoints: list[Location]) -> RouteResult: ...

    def nearby_fuel(self, coordinate: tuple[float, float]) -> NearbyPlace | None: ...

    def reverse(self, coordinate: tuple[float, float]) -> ReverseLocation: ...

    def close(self) -> None: ...
