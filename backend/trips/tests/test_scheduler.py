from __future__ import annotations

from datetime import UTC, datetime
from math import nan

import pytest

from trips.domain import Location, RouteLeg, RouteLocator, RouteResult
from trips.providers.demo import DemoRoutingProvider
from trips.scheduler import SchedulingError, schedule_route

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


def test_route_locator_uses_each_leg_geometry_and_exact_waypoint_boundary() -> None:
    current = Location("Current", 0, 0)
    pickup = Location("Pickup", 0, 1)
    dropoff = Location("Drop-off", 0, 11)
    route = RouteResult(
        # Provider geometry can be snapped slightly away from requested
        # waypoint coordinates and have very different per-leg proportions.
        coordinates=((0, 0), (0.5, 0), (1.1, 0), (6, 0), (11.2, 0)),
        legs=(
            RouteLeg(0, current, pickup, 100, 2),
            RouteLeg(1, pickup, dropoff, 100, 2),
        ),
        instructions=(),
        distance_miles=200,
        duration_hours=4,
        attribution="test",
    )
    locator = RouteLocator(route)

    assert locator.coordinate_at(0) == current.coordinate
    assert locator.coordinate_at(100) == pickup.coordinate
    assert locator.coordinate_at(200) == dropoff.coordinate
    assert locator.label_at(100) == "Pickup"
    assert locator.coordinate_at(50) == pytest.approx((0.5, 0))
    assert locator.coordinate_at(150) == pytest.approx((6, 0))


def test_route_locator_prefers_explicit_leg_paths_for_loopback_geometry() -> None:
    current = Location("Current", 0, 0)
    pickup = Location("Pickup", 0, 1)
    dropoff = Location("Drop-off", 0, 10)
    route = RouteResult(
        coordinates=((0, 0), (1.01, 0), (8, 0), (1.0001, 0), (10, 0)),
        legs=(
            RouteLeg(0, current, pickup, 100, 2),
            RouteLeg(1, pickup, dropoff, 100, 2),
        ),
        instructions=(),
        distance_miles=200,
        duration_hours=4,
        attribution="test",
        leg_coordinates=(
            ((0, 0), (1.01, 0)),
            ((1.01, 0), (8, 0), (1.0001, 0), (10, 0)),
        ),
    )
    locator = RouteLocator(route)

    assert locator.coordinate_at(50) == pytest.approx((0.5, 0))
    assert locator.coordinate_at(100) == pickup.coordinate
    assert locator.coordinate_at(150) == pytest.approx((3.5001, 0), abs=0.0001)


def test_demo_provider_preserves_each_leg_geometry() -> None:
    current = Location("Current", 35, -90)
    pickup = Location("Pickup", 36, -100)
    dropoff = Location("Drop-off", 37, -110)

    route = DemoRoutingProvider().route([current, pickup, dropoff])

    assert len(route.leg_coordinates) == 2
    assert route.leg_coordinates[0][0] == current.coordinate
    assert route.leg_coordinates[0][-1] == pickup.coordinate
    assert route.leg_coordinates[1][0] == pickup.coordinate
    assert route.leg_coordinates[1][-1] == dropoff.coordinate


def test_short_trip_only_has_required_waypoint_work() -> None:
    route = make_route(2, 3)
    events = schedule_route(route, DEPARTURE, 0)

    assert [event.event_type for event in events] == [
        "pretrip_inspection",
        "driving",
        "pickup",
        "driving",
        "dropoff",
    ]
    assert sum(event.miles_driven for event in events) == pytest.approx(route.distance_miles)
    assert [
        event.duration_hours for event in events if event.event_type in {"pickup", "dropoff"}
    ] == [1, 1]
    assert events[0].status == "on_duty"
    assert events[0].duration_hours == pytest.approx(0.5)
    assert events[-1].event_type == "dropoff"
    assert not any(event.event_type.startswith("posttrip") for event in events)


def test_pickup_at_eight_hours_satisfies_break() -> None:
    events = schedule_route(make_route(8, 2), DEPARTURE, 0)

    assert [event.event_type for event in events[:4]] == [
        "pretrip_inspection",
        "driving",
        "pickup",
        "driving",
    ]
    assert not any(event.event_type in {"break", "meal_break"} for event in events)


def test_dedicated_break_is_inserted_after_eight_driving_hours() -> None:
    events = schedule_route(make_route(1, 10), DEPARTURE, 0)
    break_event = next(event for event in events if event.event_type == "meal_break")

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
    assert "Meal/rest" in break_event.note


def test_eleven_hour_limit_requires_ten_hour_rest() -> None:
    events = schedule_route(make_route(2, 12), DEPARTURE, 0)
    meal_index = next(
        index
        for index, event in enumerate(events)
        if event.event_type == "meal_break" and "beginning 10 consecutive" in event.note
    )
    meal, sleeper, pretrip = events[meal_index : meal_index + 3]

    assert meal.status == "off_duty"
    assert meal.duration_hours == pytest.approx(1)
    assert "11-hour" in meal.note
    assert sleeper.event_type == "rest"
    assert sleeper.status == "sleeper_berth"
    assert sleeper.duration_hours == pytest.approx(9)
    assert pretrip.event_type == "pretrip_inspection"
    assert pretrip.status == "on_duty"
    assert pretrip.duration_hours == pytest.approx(0.5)
    assert meal.end_at == sleeper.start_at
    assert sleeper.end_at == pretrip.start_at


def test_waypoint_snap_never_increases_drive_past_eleven_hour_limit() -> None:
    # After eight hours on the first leg, only three daily driving hours remain.
    # At this speed the old mileage-based tolerance snapped the 3.1-hour second
    # leg to its waypoint and silently turned the day into 11.1 driving hours.
    events = schedule_route(make_route(8, 3.1, speed=0.00005), DEPARTURE, 0)
    driving = [event for event in events if event.status == "driving"]

    assert [event.duration_hours for event in driving] == pytest.approx([8, 3, 0.1])
    assert any(event.event_type == "rest" for event in events)
    assert events[-1].event_type == "dropoff"


def test_ultra_slow_long_route_preserves_daily_limit_at_final_waypoint() -> None:
    events = schedule_route(make_route(0.1, 500, speed=0.00001), DEPARTURE, 0)
    daily_driving = 0.0

    for event in events:
        if event.status == "driving":
            daily_driving += event.duration_hours
            assert daily_driving <= 11 + 1e-6
        elif event.event_type in {"rest", "cycle_restart"}:
            daily_driving = 0.0

    assert events[-1].event_type == "dropoff"


def test_tiny_positive_second_leg_always_reaches_dropoff() -> None:
    route = make_route(0.1, 0.1, speed=0.000001)

    events = schedule_route(route, DEPARTURE, 0)

    assert [event.event_type for event in events] == [
        "pretrip_inspection",
        "driving",
        "pickup",
        "driving",
        "dropoff",
    ]
    assert sum(event.miles_driven for event in events) == pytest.approx(route.distance_miles)


def test_fourteen_hour_window_can_bind_before_driving_limit() -> None:
    # High synthetic speed creates enough 950-mile on-duty fuel events for the
    # 14-hour window to bind before 11 driving hours. This isolates that clock.
    events = schedule_route(make_route(0.1, 12, speed=1000), DEPARTURE, 0)
    rest_meals = [
        event
        for event in events
        if event.event_type == "meal_break" and "beginning 10 consecutive" in event.note
    ]

    assert rest_meals
    assert any("14-hour" in event.note for event in rest_meals)


def test_cycle_at_seventy_starts_with_one_restart() -> None:
    events = schedule_route(make_route(1, 1), DEPARTURE, 70)

    assert events[0].event_type == "cycle_restart"
    assert events[0].duration_hours == pytest.approx(34)
    assert events[1].event_type == "pretrip_inspection"
    assert events[2].status == "driving"


def test_cycle_without_room_for_pretrip_and_driving_restarts_first() -> None:
    events = schedule_route(make_route(1, 1), DEPARTURE, 69.5)

    assert [event.event_type for event in events[:3]] == [
        "cycle_restart",
        "pretrip_inspection",
        "driving",
    ]


def test_on_duty_pickup_can_exceed_cycle_but_no_more_driving_occurs() -> None:
    events = schedule_route(make_route(0.5, 1), DEPARTURE, 69)
    restart_index = next(
        index for index, event in enumerate(events) if event.event_type == "cycle_restart"
    )

    assert events[restart_index - 1].event_type == "pickup"
    assert sum(
        event.duration_hours
        for event in events[:restart_index]
        if event.status in {"driving", "on_duty"}
    ) + 69 == pytest.approx(71)
    assert events[restart_index + 1].event_type == "pretrip_inspection"
    assert events[restart_index + 2].status == "driving"


def test_cycle_exhaustion_mid_drive_restarts_before_more_driving() -> None:
    events = schedule_route(make_route(1, 1), DEPARTURE, 69.4)
    restart_index = next(
        index for index, event in enumerate(events) if event.event_type == "cycle_restart"
    )

    assert events[restart_index - 1].status == "driving"
    assert events[restart_index - 1].duration_hours == pytest.approx(0.1)
    assert events[restart_index + 1].event_type == "pretrip_inspection"
    assert events[restart_index + 2].status == "driving"


def test_simultaneous_daily_and_cycle_limits_use_only_restart() -> None:
    events = schedule_route(make_route(1, 12), DEPARTURE, 57.5)
    restart_index = next(
        index for index, event in enumerate(events) if event.event_type == "cycle_restart"
    )

    assert events[restart_index - 1].status == "driving"
    assert events[restart_index + 1].event_type == "pretrip_inspection"
    assert events[restart_index + 2].status == "driving"
    assert not any(
        event.event_type == "rest" for event in events[max(0, restart_index - 2) : restart_index]
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
    assert not any(event.event_type in {"break", "meal_break"} for event in events)


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
    for index, event in enumerate(events):
        if event.status == "driving":
            assert daily_driving + event.duration_hours <= 11 + 1e-6
            assert shift + event.duration_hours <= 14 + 1e-6
            assert break_driving + event.duration_hours <= 8 + 1e-6
            assert cycle + event.duration_hours <= 70 + 1e-6
            daily_driving += event.duration_hours
            shift += event.duration_hours
            break_driving += event.duration_hours
            cycle += event.duration_hours
        elif event.status == "on_duty":
            shift += event.duration_hours
            cycle += event.duration_hours
            if event.duration_hours >= 0.5:
                break_driving = 0.0
        elif event.event_type in {"break", "meal_break"}:
            shift += event.duration_hours
            break_driving = 0.0
        elif event.event_type == "rest":
            previous = events[index - 1]
            assert previous.event_type == "meal_break"
            assert previous.duration_hours + event.duration_hours == pytest.approx(10)
            assert event.status == "sleeper_berth"
            daily_driving = shift = break_driving = 0.0
        elif event.event_type == "cycle_restart":
            daily_driving = shift = break_driving = cycle = 0.0


@pytest.mark.parametrize("cycle_used", [nan, -0.1, 70.1])
def test_rejects_invalid_cycle_values_at_the_domain_boundary(cycle_used: float) -> None:
    with pytest.raises(SchedulingError, match="finite number from 0 to 70"):
        schedule_route(make_route(1, 1), DEPARTURE, cycle_used)
