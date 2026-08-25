"""Pure event-based scheduler for the assessment's HOS assumptions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from trips.domain import DutyEvent, DutyStatus, EventType, RouteLocator, RouteResult

MAX_DAILY_DRIVING_HOURS = 11.0
MAX_DRIVING_WINDOW_HOURS = 14.0
BREAK_AFTER_DRIVING_HOURS = 8.0
BREAK_DURATION_HOURS = 0.5
DAILY_REST_HOURS = 10.0
CYCLE_LIMIT_HOURS = 70.0
CYCLE_RESTART_HOURS = 34.0
FUEL_TARGET_MILES = 950.0
PICKUP_DROPOFF_HOURS = 1.0
EPSILON = 1e-7


class SchedulingError(RuntimeError):
    pass


@dataclass(slots=True)
class _ClockState:
    now: datetime
    route_mile: float
    daily_driving: float
    shift_elapsed: float
    break_driving: float
    cycle_used: float
    miles_since_fuel: float


def schedule_route(
    route: RouteResult,
    departure_at: datetime,
    current_cycle_used_hours: float,
) -> list[DutyEvent]:
    """Create a chronological timeline without I/O or provider dependencies."""

    if departure_at.tzinfo is None:
        raise SchedulingError("departure_at must be timezone-aware")
    if len(route.legs) != 2:
        raise SchedulingError("A trip route must contain current→pickup and pickup→drop-off legs")
    if route.distance_miles <= 0 or any(
        leg.distance_miles <= 0 or leg.duration_hours <= 0 for leg in route.legs
    ):
        raise SchedulingError("Route distance and duration must be positive")

    locator = RouteLocator(route)
    state = _ClockState(
        now=departure_at.astimezone(UTC),
        route_mile=0.0,
        daily_driving=0.0,
        shift_elapsed=0.0,
        break_driving=0.0,
        cycle_used=float(current_cycle_used_hours),
        miles_since_fuel=0.0,
    )
    events: list[DutyEvent] = []
    leg_index = 0
    leg_end_mile = route.legs[0].distance_miles

    for _ in range(10_000):
        # A route waypoint wins a tie with a fuel threshold. After servicing
        # pickup, a fuel event at the same mile is still inserted if required.
        if state.miles_since_fuel >= FUEL_TARGET_MILES - EPSILON:
            _append_stationary(
                events,
                state,
                locator,
                status="on_duty",
                event_type="fuel",
                duration_hours=BREAK_DURATION_HOURS,
                note="Fuel stop scheduled before 1,000 miles since the previous fueling point.",
            )
            state.shift_elapsed += BREAK_DURATION_HOURS
            state.cycle_used += BREAK_DURATION_HOURS
            state.break_driving = 0.0
            state.miles_since_fuel = 0.0
            continue

        # Check the cycle first so a simultaneous daily/cycle limit becomes
        # one 34-hour restart instead of a redundant 10-hour rest plus restart.
        if state.cycle_used >= CYCLE_LIMIT_HOURS - EPSILON:
            _append_stationary(
                events,
                state,
                locator,
                status="off_duty",
                event_type="cycle_restart",
                duration_hours=CYCLE_RESTART_HOURS,
                note="34-hour restart required because the simplified 70-hour cycle was exhausted.",
            )
            state.cycle_used = 0.0
            state.daily_driving = 0.0
            state.shift_elapsed = 0.0
            state.break_driving = 0.0
            continue

        if (
            state.daily_driving >= MAX_DAILY_DRIVING_HOURS - EPSILON
            or state.shift_elapsed >= MAX_DRIVING_WINDOW_HOURS - EPSILON
        ):
            reason = (
                "11-hour driving limit reached."
                if state.daily_driving >= MAX_DAILY_DRIVING_HOURS - EPSILON
                else "14-hour driving window reached."
            )
            _append_stationary(
                events,
                state,
                locator,
                status="off_duty",
                event_type="rest",
                duration_hours=DAILY_REST_HOURS,
                note=f"10 consecutive hours off duty; {reason}",
            )
            state.daily_driving = 0.0
            state.shift_elapsed = 0.0
            state.break_driving = 0.0
            continue

        if state.break_driving >= BREAK_AFTER_DRIVING_HOURS - EPSILON:
            _append_stationary(
                events,
                state,
                locator,
                status="off_duty",
                event_type="break",
                duration_hours=BREAK_DURATION_HOURS,
                note="30-minute break after eight cumulative driving hours.",
            )
            state.shift_elapsed += BREAK_DURATION_HOURS
            state.break_driving = 0.0
            continue

        leg = route.legs[leg_index]
        speed_mph = leg.distance_miles / leg.duration_hours
        distance_to_waypoint = max(0.0, leg_end_mile - state.route_mile)
        limits = {
            "waypoint": distance_to_waypoint / speed_mph,
            "fuel": max(0.0, FUEL_TARGET_MILES - state.miles_since_fuel) / speed_mph,
            "break": max(0.0, BREAK_AFTER_DRIVING_HOURS - state.break_driving),
            "daily": max(0.0, MAX_DAILY_DRIVING_HOURS - state.daily_driving),
            "window": max(0.0, MAX_DRIVING_WINDOW_HOURS - state.shift_elapsed),
            "cycle": max(0.0, CYCLE_LIMIT_HOURS - state.cycle_used),
        }
        drive_hours = min(limits.values())
        if drive_hours <= EPSILON:
            raise SchedulingError(
                f"Scheduler made no progress at route mile {state.route_mile:.3f}"
            )

        distance = min(distance_to_waypoint, speed_mph * drive_hours)
        start_mile = state.route_mile
        end_mile = start_mile + distance
        reached_waypoint = limits["waypoint"] <= drive_hours + EPSILON
        if reached_waypoint:
            end_mile = leg_end_mile
            distance = end_mile - start_mile

        start_at = state.now
        end_at = start_at + timedelta(hours=drive_hours)
        events.append(
            DutyEvent(
                id=f"event-{len(events) + 1}",
                status="driving",
                event_type="driving",
                start_at=start_at,
                end_at=end_at,
                start_location=locator.label_at(start_mile),
                end_location=locator.label_at(end_mile),
                start_coordinates=locator.coordinate_at(start_mile),
                end_coordinates=locator.coordinate_at(end_mile),
                start_mile=start_mile,
                end_mile=end_mile,
                miles_driven=distance,
                note=f"Drive toward {leg.end.label}.",
            )
        )
        state.now = end_at
        state.route_mile = end_mile
        state.daily_driving += drive_hours
        state.shift_elapsed += drive_hours
        state.break_driving += drive_hours
        state.cycle_used += drive_hours
        state.miles_since_fuel += distance

        if reached_waypoint:
            is_final = leg_index == len(route.legs) - 1
            event_type: EventType = "dropoff" if is_final else "pickup"
            waypoint = leg.end
            _append_stationary(
                events,
                state,
                locator,
                status="on_duty",
                event_type=event_type,
                duration_hours=PICKUP_DROPOFF_HOURS,
                note=(
                    "One hour on duty for drop-off." if is_final else "One hour on duty for pickup."
                ),
                location=waypoint.label,
                coordinate=waypoint.coordinate,
            )
            state.shift_elapsed += PICKUP_DROPOFF_HOURS
            state.cycle_used += PICKUP_DROPOFF_HOURS
            # Any non-driving period of at least 30 minutes satisfies the
            # assessment's simplified eight-hour break requirement.
            state.break_driving = 0.0
            if is_final:
                break
            leg_index += 1
            leg_end_mile += route.legs[leg_index].distance_miles
    else:
        raise SchedulingError("Scheduler exceeded its safety iteration limit")

    return events


def _append_stationary(
    events: list[DutyEvent],
    state: _ClockState,
    locator: RouteLocator,
    *,
    status: DutyStatus,
    event_type: EventType,
    duration_hours: float,
    note: str,
    location: str | None = None,
    coordinate: tuple[float, float] | None = None,
) -> None:
    start_at = state.now
    end_at = start_at + timedelta(hours=duration_hours)
    event_coordinate = coordinate or locator.coordinate_at(state.route_mile)
    event_location = location or locator.label_at(state.route_mile)
    events.append(
        DutyEvent(
            id=f"event-{len(events) + 1}",
            status=status,
            event_type=event_type,
            start_at=start_at,
            end_at=end_at,
            start_location=event_location,
            end_location=event_location,
            start_coordinates=event_coordinate,
            end_coordinates=event_coordinate,
            start_mile=state.route_mile,
            end_mile=state.route_mile,
            miles_driven=0.0,
            note=note,
        )
    )
    state.now = end_at
