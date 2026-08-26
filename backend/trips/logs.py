"""Project a canonical duty timeline onto 24-hour ELD-style log grids."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from trips.domain import (
    ROUTE_MILE_PREFIX,
    DutyEvent,
    DutyStatus,
    RouteLocator,
    RouteResult,
    route_mile_key,
)

STATUSES: tuple[DutyStatus, ...] = (
    "off_duty",
    "sleeper_berth",
    "driving",
    "on_duty",
)
PAPER_RECAP_CYCLE_LIMIT_HOURS = 70.0
PAPER_RECAP_ESTIMATE_BASIS = (
    "Conservative 70-hour/8-day estimate: no prior hours are assumed to age out "
    "before a scheduled 34-hour restart."
)


def build_daily_logs(
    events: list[DutyEvent],
    timezone_name: str,
    route: RouteResult,
    initial_cycle_used_hours: float,
    *,
    resolved_route_locations: Mapping[float, str] | None = None,
) -> list[dict[str, object]]:
    if not events:
        return []

    zone = ZoneInfo(timezone_name)
    locator = RouteLocator(route)
    location_labels = resolved_route_locations or {}
    first_date = events[0].start_at.astimezone(zone).date()
    # An event ending exactly at midnight does not add an empty log sheet.
    final_instant = events[-1].end_at - timedelta(microseconds=1)
    last_date = final_instant.astimezone(zone).date()

    logs: list[dict[str, object]] = []
    current_date = first_date
    while current_date <= last_date:
        day_start = datetime.combine(current_date, time.min, tzinfo=zone)
        day_end = datetime.combine(current_date + timedelta(days=1), time.min, tzinfo=zone)
        touching = [event for event in events if _overlaps(event, day_start, day_end)]
        segments = _segments_for_day(touching, day_start, day_end)
        raw_miles = sum(_miles_for_day(event, day_start, day_end) for event in touching)
        remarks = _remarks_for_day(
            touching,
            current_date,
            zone,
            day_start=day_start,
            day_end=day_end,
            locator=locator,
            resolved_route_locations=location_labels,
        )
        status_totals = _status_totals(segments)
        cycle_start = _cycle_at(events, day_start.astimezone(UTC), initial_cycle_used_hours)
        cycle_end = _cycle_at(events, day_end.astimezone(UTC), initial_cycle_used_hours)
        rounded_cycle_end = round(cycle_end, 2)
        estimated_available = round(
            max(0.0, PAPER_RECAP_CYCLE_LIMIT_HOURS - cycle_end),
            2,
        )
        restart_completed = any(
            event.event_type == "cycle_restart"
            and day_start.astimezone(UTC) < event.end_at.astimezone(UTC) <= day_end.astimezone(UTC)
            for event in events
        )

        logs.append(
            {
                "date": current_date.isoformat(),
                "timezone": timezone_name,
                "from_location": (
                    _location_at(
                        touching[0],
                        max(touching[0].start_at, day_start.astimezone(UTC)),
                        locator,
                        location_labels,
                    )
                    if touching
                    else "Off duty"
                ),
                "to_location": (
                    _location_at(
                        touching[-1],
                        min(touching[-1].end_at, day_end.astimezone(UTC)),
                        locator,
                        location_labels,
                    )
                    if touching
                    else "Off duty"
                ),
                "total_miles": round(raw_miles, 2),
                "status_totals": status_totals,
                "grid_note": _grid_note(day_start, day_end),
                "cycle_used_hours": rounded_cycle_end,
                "recap": {
                    "on_duty_today": round(_elapsed_on_duty_hours(touching, day_start, day_end), 2),
                    "cycle_used_at_start": round(cycle_start, 2),
                    "cycle_used_at_end": rounded_cycle_end,
                    "remaining_cycle_hours": estimated_available,
                    "restart_completed": restart_completed,
                    "seventy_hour_a": rounded_cycle_end,
                    "seventy_hour_b": estimated_available,
                    "seventy_hour_c": rounded_cycle_end,
                    "estimated": True,
                    "estimate_basis": PAPER_RECAP_ESTIMATE_BASIS,
                },
                "segments": segments,
                "remarks": remarks,
            }
        )
        current_date += timedelta(days=1)

    # Independent per-day rounding can lose a few hundredths. Reconcile the
    # final sheet so the public invariant is exact at API precision.
    target_miles = round(route.distance_miles, 2)
    target_cents = int(round(target_miles * 100))
    day_cents = [int(round(float(log["total_miles"]) * 100)) for log in logs]
    adjustment_cents = target_cents - sum(day_cents)

    if adjustment_cents >= 0:
        adjustment_index = next(
            (index for index in range(len(logs) - 1, -1, -1) if day_cents[index] > 0),
            len(logs) - 1,
        )
        day_cents[adjustment_index] += adjustment_cents
    else:
        # Several very small driving days can each round up by a cent. Remove
        # that excess backward across positive days instead of making the last
        # positive day negative.
        remaining_cents = -adjustment_cents
        for index in range(len(day_cents) - 1, -1, -1):
            removed_cents = min(day_cents[index], remaining_cents)
            day_cents[index] -= removed_cents
            remaining_cents -= removed_cents
            if remaining_cents == 0:
                break

    for log, cents in zip(logs, day_cents):
        log["total_miles"] = cents / 100
    return logs


def collect_log_location_points(
    events: list[DutyEvent],
    timezone_name: str,
    route: RouteResult,
) -> dict[float, tuple[float, float]]:
    """Collect unresolved event boundaries and local-midnight route positions.

    The returned route-mile keys let one reverse-geocoded label be reused by the
    driving event before a stop, the stop itself, the following drive, and the
    daily-log projection.
    """

    if not events:
        return {}

    points: dict[float, tuple[float, float]] = {}
    for event in events:
        if event.start_location.startswith(ROUTE_MILE_PREFIX):
            points.setdefault(route_mile_key(event.start_mile), event.start_coordinates)
        if event.end_location.startswith(ROUTE_MILE_PREFIX):
            points.setdefault(route_mile_key(event.end_mile), event.end_coordinates)

    zone = ZoneInfo(timezone_name)
    locator = RouteLocator(route)
    first_date = events[0].start_at.astimezone(zone).date()
    final_instant = events[-1].end_at.astimezone(UTC)
    midnight_date = first_date + timedelta(days=1)

    while True:
        midnight = datetime.combine(midnight_date, time.min, tzinfo=zone).astimezone(UTC)
        if midnight >= final_instant:
            break
        active_event = next(
            (
                event
                for event in events
                if event.start_at.astimezone(UTC) <= midnight < event.end_at.astimezone(UTC)
            ),
            None,
        )
        if active_event is not None:
            route_mile = _route_mile_at(active_event, midnight)
            if locator.label_at(route_mile).startswith(ROUTE_MILE_PREFIX):
                points.setdefault(
                    route_mile_key(route_mile),
                    locator.coordinate_at(route_mile),
                )
        midnight_date += timedelta(days=1)

    return points


def _overlaps(event: DutyEvent, day_start: datetime, day_end: datetime) -> bool:
    event_start = event.start_at.astimezone(UTC)
    event_end = event.end_at.astimezone(UTC)
    return event_start < day_end.astimezone(UTC) and event_end > day_start.astimezone(UTC)


def _segments_for_day(
    events: list[DutyEvent],
    day_start: datetime,
    day_end: datetime,
) -> list[dict[str, object]]:
    pieces: list[tuple[DutyStatus, float, float]] = []
    cursor = 0.0
    day_start_utc = day_start.astimezone(UTC)
    day_end_utc = day_end.astimezone(UTC)

    for event in events:
        overlap_start = max(event.start_at.astimezone(UTC), day_start_utc)
        overlap_end = min(event.end_at.astimezone(UTC), day_end_utc)
        if overlap_end <= overlap_start:
            continue
        start_minute = (
            0.0
            if overlap_start == day_start_utc
            else _grid_minute(overlap_start, day_start, day_end)
        )
        end_minute = (
            1440.0 if overlap_end == day_end_utc else _grid_minute(overlap_end, day_start, day_end)
        )
        start_minute = min(1440.0, max(0.0, start_minute))
        end_minute = min(1440.0, max(start_minute, end_minute))

        if start_minute > cursor:
            pieces.append(("off_duty", cursor, start_minute))
        if end_minute > max(cursor, start_minute):
            pieces.append((event.status, max(cursor, start_minute), end_minute))
            cursor = end_minute

    if cursor < 1440.0:
        pieces.append(("off_duty", cursor, 1440.0))
    if not pieces:
        pieces = [("off_duty", 0.0, 1440.0)]

    merged: list[tuple[DutyStatus, float, float]] = []
    for status, start, end in pieces:
        if merged and merged[-1][0] == status and abs(merged[-1][2] - start) < 1e-6:
            previous_status, previous_start, _ = merged[-1]
            merged[-1] = (previous_status, previous_start, end)
        else:
            merged.append((status, start, end))

    return [
        {
            "status": status,
            "start_minute": round(start, 3),
            "end_minute": round(end, 3),
        }
        for status, start, end in merged
    ]


def _grid_minute(value: datetime, day_start: datetime, day_end: datetime) -> float:
    """Project real elapsed time monotonically onto a 24-hour paper grid."""

    start_utc = day_start.astimezone(UTC)
    end_utc = day_end.astimezone(UTC)
    elapsed_seconds = (value.astimezone(UTC) - start_utc).total_seconds()
    day_seconds = (end_utc - start_utc).total_seconds()
    if day_seconds <= 0:
        return 0.0
    return elapsed_seconds / day_seconds * 1440.0


def _grid_note(day_start: datetime, day_end: datetime) -> str | None:
    elapsed_hours = (day_end.astimezone(UTC) - day_start.astimezone(UTC)).total_seconds() / 3600
    if abs(elapsed_hours - 24.0) < 1e-9:
        return None
    transition = "spring-forward" if elapsed_hours < 24 else "fall-back"
    return (
        f"Daylight-saving {transition}: the {elapsed_hours:g}-hour local day is "
        "projected proportionally onto this 24-hour paper grid. Remark clock "
        "times and timezone abbreviations preserve the actual local time."
    )


def _status_totals(segments: list[dict[str, object]]) -> dict[str, float]:
    raw = {status: 0.0 for status in STATUSES}
    for segment in segments:
        status = str(segment["status"])
        raw[status] += (float(segment["end_minute"]) - float(segment["start_minute"])) / 60
    totals = {status: round(raw[status], 2) for status in STATUSES}
    difference = round(24.0 - sum(totals.values()), 2)
    totals["off_duty"] = round(totals["off_duty"] + difference, 2)
    return totals


def _miles_for_day(event: DutyEvent, day_start: datetime, day_end: datetime) -> float:
    if event.status != "driving" or event.miles_driven <= 0:
        return 0.0
    start = max(event.start_at.astimezone(UTC), day_start.astimezone(UTC))
    end = min(event.end_at.astimezone(UTC), day_end.astimezone(UTC))
    if end <= start:
        return 0.0
    total_seconds = (event.end_at.astimezone(UTC) - event.start_at.astimezone(UTC)).total_seconds()
    overlap_seconds = (end - start).total_seconds()
    return event.miles_driven * overlap_seconds / total_seconds


def _elapsed_on_duty_hours(
    events: list[DutyEvent], day_start: datetime, day_end: datetime
) -> float:
    start_utc = day_start.astimezone(UTC)
    end_utc = day_end.astimezone(UTC)
    seconds = 0.0
    for event in events:
        if event.status not in {"driving", "on_duty"}:
            continue
        overlap_start = max(event.start_at.astimezone(UTC), start_utc)
        overlap_end = min(event.end_at.astimezone(UTC), end_utc)
        if overlap_end > overlap_start:
            seconds += (overlap_end - overlap_start).total_seconds()
    return seconds / 3600


def _route_mile_at(event: DutyEvent, instant: datetime) -> float:
    instant_utc = instant.astimezone(UTC)
    start_utc = event.start_at.astimezone(UTC)
    end_utc = event.end_at.astimezone(UTC)
    if instant_utc <= start_utc:
        return event.start_mile
    if instant_utc >= end_utc:
        return event.end_mile
    if event.status != "driving" or event.end_mile <= event.start_mile:
        return event.start_mile

    event_seconds = (end_utc - start_utc).total_seconds()
    elapsed_seconds = (instant_utc - start_utc).total_seconds()
    return event.start_mile + (event.end_mile - event.start_mile) * elapsed_seconds / event_seconds


def _location_at(
    event: DutyEvent,
    instant: datetime,
    locator: RouteLocator,
    resolved_route_locations: Mapping[float, str],
) -> str:
    route_mile = _route_mile_at(event, instant)
    resolved = resolved_route_locations.get(route_mile_key(route_mile))
    if resolved:
        return resolved

    instant_utc = instant.astimezone(UTC)
    if instant_utc <= event.start_at.astimezone(UTC):
        return event.start_location
    if instant_utc >= event.end_at.astimezone(UTC):
        return event.end_location
    if event.status != "driving" or event.end_mile <= event.start_mile:
        return event.start_location
    return locator.label_at(route_mile)


def _remarks_for_day(
    events: list[DutyEvent],
    day: date,
    zone: ZoneInfo,
    *,
    day_start: datetime,
    day_end: datetime,
    locator: RouteLocator,
    resolved_route_locations: Mapping[float, str],
) -> list[dict[str, object]]:
    remarks: list[dict[str, object]] = []
    for event in events:
        local_start = event.start_at.astimezone(zone)
        if local_start.date() == day:
            remark_at = event.start_at
            note = event.note
            activity = _remark_activity(event)
            location = _location_at(
                event,
                event.start_at,
                locator,
                resolved_route_locations,
            )
        else:
            remark_at = day_start
            note = f"Continued: {event.note}"
            activity = f"Continued {_remark_activity(event).lower()}"
            location = _location_at(
                event,
                day_start,
                locator,
                resolved_route_locations,
            )
        minute = _grid_minute(remark_at, day_start, day_end)
        local_remark_at = remark_at.astimezone(zone)
        remarks.append(
            {
                "event_id": event.id,
                "time": f"{local_remark_at.hour:02d}:{local_remark_at.minute:02d}",
                "minute": round(minute, 3),
                "status": event.status,
                "location": location,
                "activity": activity,
                "note": note,
                "timezone_abbreviation": local_remark_at.tzname() or "",
            }
        )

    return remarks


def _remark_activity(event: DutyEvent) -> str:
    if event.event_type == "pretrip_inspection":
        return "Pre-trip inspection"
    if event.event_type == "driving":
        return "Driving"
    if event.event_type == "pickup":
        return "Pickup"
    if event.event_type == "dropoff":
        return "Drop-off"
    if event.event_type == "fuel":
        return "Fueling"
    if event.event_type in {"break", "meal_break"}:
        return "Meal/dinner break" if "dinner" in event.note.lower() else "Meal/rest break"
    if event.event_type == "rest":
        return "Sleeper berth"
    if event.event_type == "cycle_restart":
        return "Cycle restart"
    return "Duty-status change"


def _cycle_at(events: list[DutyEvent], cutoff: datetime, initial_cycle_used_hours: float) -> float:
    cycle_used = float(initial_cycle_used_hours)
    cutoff_utc = cutoff.astimezone(UTC)
    for event in events:
        start = event.start_at.astimezone(UTC)
        end = event.end_at.astimezone(UTC)
        if start >= cutoff_utc:
            break
        if event.status in {"driving", "on_duty"}:
            overlap_end = min(end, cutoff_utc)
            if overlap_end > start:
                cycle_used += (overlap_end - start).total_seconds() / 3600
        if event.event_type == "cycle_restart" and end <= cutoff_utc:
            cycle_used = 0.0
    return cycle_used
