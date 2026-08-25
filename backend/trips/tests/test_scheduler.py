from __future__ import annotations

from datetime import UTC, datetime

import pytest

from trips.domain import Location, RouteLeg, RouteResult
from trips.scheduler import schedule_route

DEPARTURE = datetime(2026, 8, 25, 6, tzinfo=UTC)


def make_route(first_hours: float, second_hours: float, *, speed: float = 60) -> RouteResult:
    current = Location("Current", 35.0, -90.0)
    pickup = Location("Pickup", 36.0, -100.0)
    dropoff = Location("Drop-off", 37.0, -110.0)
    first_distance = first_hours * speed
    second_distance = second_hours * speed
    legs = (
        RouteLeg(0, current, pickup, first_distance, first_hours),
        RouteLeg(1, pickup, dropoff, second_distance, second_hours),
    )
    return RouteResult(
        coordinates=(current.coordinate, pickup.coordinate, dropoff.coordinate),
        legs=legs,
        instructions=(),
        distance_miles=first_distance + second_distance,
        duration_hours=first_hours + second_hours,
        attribution="test",
    )


def test_short_trip_only_has_required_waypoint_work() -> None:
    route = make_route(2, 3)
    events = schedule_route(route, DEPARTURE, 0)

    assert [event.event_type for event in events] == [
        "driving",
        "pickup",
        "driving",
        "dropoff",
    ]
    assert sum(event.miles_driven for event in events) == pytest.approx(route.distance_miles)
    assert [event.duration_hours for event in events if event.event_type in {"pickup", "dropoff"}] == [1, 1]


def test_pickup_at_eight_hours_satisfies_break() -> None:
    events = schedule_route(make_route(8, 2), DEPARTURE, 0)

    assert [event.event_type for event in events[:3]] == ["driving", "pickup", "driving"]
    assert not any(event.event_type == "break" for event in events)


def test_dedicated_break_is_inserted_after_eight_driving_hours() -> None:
    events = schedule_route(make_route(1, 10), DEPARTURE, 0)
    break_event = next(event for event in events if event.event_type == "break")

    previous_pickup = next(event for event in events if event.event_type == "pickup")
    driving_since_pickup = sum(
        event.duration_hours
        for event in events
        if event.status == "driving"
        and event.start_at >= previous_pickup.end_at
        and event.end_at <= break_event.start_at
    )
    assert driving_since_pickup == pytest.approx(8)
    assert break_event.duration_hours == pytest.approx(0.5)
    assert break_event.status == "off_duty"


def test_eleven_hour_limit_requires_ten_hour_rest() -> None:
    events = schedule_route(make_route(2, 12), DEPARTURE, 0)
    rest = next(event for event in events if event.event_type == "rest")

    assert rest.duration_hours == pytest.approx(10)
    assert "11-hour" in rest.note


def test_fourteen_hour_window_can_bind_before_driving_limit() -> None:
    # High synthetic speed creates enough 950-mile on-duty fuel events for the
    # 14-hour window to bind before 11 driving hours. This isolates that clock.
    events = schedule_route(make_route(0.1, 12, speed=1000), DEPARTURE, 0)
    rests = [event for event in events if event.event_type == "rest"]

    assert rests
    assert any("14-hour" in event.note for event in rests)


def test_cycle_at_seventy_starts_with_one_restart() -> None:
    events = schedule_route(make_route(1, 1), DEPARTURE, 70)

    assert events[0].event_type == "cycle_restart"
    assert events[0].duration_hours == pytest.approx(34)
    assert events[1].status == "driving"


def test_cycle_exhaustion_mid_drive_restarts_before_more_driving() -> None:
    events = schedule_route(make_route(1, 1), DEPARTURE, 69.8)
    restart_index = next(index for index, event in enumerate(events) if event.event_type == "cycle_restart")

    assert events[restart_index - 1].status == "driving"
    assert events[restart_index - 1].duration_hours == pytest.approx(0.2)
    assert events[restart_index + 1].status == "driving"


def test_simultaneous_daily_and_cycle_limits_use_only_restart() -> None:
    events = schedule_route(make_route(1, 12), DEPARTURE, 58)
    restart_index = next(index for index, event in enumerate(events) if event.event_type == "cycle_restart")

    assert events[restart_index - 1].status == "driving"
    assert events[restart_index + 1].status == "driving"
    assert not (
        restart_index > 0 and events[restart_index - 1].event_type == "rest"
    )


def test_multiple_fuel_stops_keep_every_gap_below_one_thousand_miles() -> None:
    route = make_route(4, 20, speed=100)
    events = schedule_route(route, DEPARTURE, 0)
    fuel_miles = [event.start_mile for event in events if event.event_type == "fuel"]
    points = [0.0, *fuel_miles, route.distance_miles]

    assert len(fuel_miles) == 2
    assert all(end - start <= 1000 for start, end in zip(points, points[1:]))


def test_fueling_at_eight_hours_satisfies_break_requirement() -> None:
    # 950 miles / 118.75 mph is exactly eight driving hours.
    events = schedule_route(make_route(9, 1, speed=118.75), DEPARTURE, 0)
    fuel = next(event for event in events if event.event_type == "fuel")

    driving_before_fuel = sum(
        event.duration_hours
        for event in events
        if event.status == "driving" and event.end_at <= fuel.start_at
    )
    assert driving_before_fuel == pytest.approx(8)
    assert fuel.duration_hours == pytest.approx(0.5)
    assert not any(event.event_type == "break" for event in events)


@pytest.mark.parametrize("cycle_used", [0, 42.5, 69.9, 70])
def test_timeline_invariants(cycle_used: float) -> None:
    route = make_route(6, 30, speed=65)
    events = schedule_route(route, DEPARTURE, cycle_used)

    assert all(left.end_at == right.start_at for left, right in zip(events, events[1:]))
    assert all(event.end_at > event.start_at for event in events)
    assert sum(event.miles_driven for event in events) == pytest.approx(route.distance_miles)
    assert all(event.end_mile >= event.start_mile for event in events)

    daily_driving = 0.0
    shift = 0.0
    break_driving = 0.0
    cycle = cycle_used
    for event in events:
        if event.status == "driving":
            assert daily_driving + event.duration_hours <= 11 + 1e-6
            assert shift + event.duration_hours <= 14 + 1e-6
            assert break_driving + event.duration_hours <= 8 + 1e-6
            assert cycle + event.duration_hours <= 70 + 1e-6
            daily_driving += event.duration_hours
            shift += event.duration_hours
            break_driving += event.duration_hours
            cycle += event.duration_hours
        elif event.event_type in {"pickup", "dropoff", "fuel"}:
            shift += event.duration_hours
            cycle += event.duration_hours
            if event.duration_hours >= 0.5:
                break_driving = 0.0
        elif event.event_type == "break":
            shift += event.duration_hours
            break_driving = 0.0
        elif event.event_type == "rest":
            daily_driving = shift = break_driving = 0.0
        elif event.event_type == "cycle_restart":
            daily_driving = shift = break_driving = cycle = 0.0
