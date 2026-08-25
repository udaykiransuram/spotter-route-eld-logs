"""Project a canonical duty timeline onto 24-hour ELD-style log grids."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from trips.domain import DutyEvent, DutyStatus

STATUSES: tuple[DutyStatus, ...] = (
    "off_duty",
    "sleeper_berth",
    "driving",
    "on_duty",
)


def build_daily_logs(
    events: list[DutyEvent],
    timezone_name: str,
    route_distance_miles: float,
    initial_cycle_used_hours: float,
) -> list[dict[str, object]]:
    if not events:
        return []

    zone = ZoneInfo(timezone_name)
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
        segments = _segments_for_day(touching, current_date, day_start, day_end)
        raw_miles = sum(_miles_for_day(event, day_start, day_end) for event in touching)
        remarks = _remarks_for_day(
            touching,
            current_date,
            zone,
            trip_completed_at=events[-1].end_at,
            final_location=events[-1].end_location,
            final_status=events[-1].status,
        )
        status_totals = _status_totals(segments)
        cycle_start = _cycle_at(
            events, day_start.astimezone(UTC), initial_cycle_used_hours
        )
        cycle_end = _cycle_at(events, day_end.astimezone(UTC), initial_cycle_used_hours)
        restart_completed = any(
            event.event_type == "cycle_restart"
            and day_start.astimezone(UTC) < event.end_at.astimezone(UTC) <= day_end.astimezone(UTC)
            for event in events
        )

        logs.append(
            {
                "date": current_date.isoformat(),
                "timezone": timezone_name,
                "from_location": touching[0].start_location if touching else "Off duty",
                "to_location": touching[-1].end_location if touching else "Off duty",
                "total_miles": round(raw_miles, 2),
                "status_totals": status_totals,
                "cycle_used_hours": round(cycle_end, 2),
                "recap": {
                    "on_duty_today": round(
                        status_totals["driving"] + status_totals["on_duty"], 2
                    ),
                    "cycle_used_at_start": round(cycle_start, 2),
                    "cycle_used_at_end": round(cycle_end, 2),
                    "remaining_cycle_hours": round(max(0.0, 70.0 - cycle_end), 2),
                    "restart_completed": restart_completed,
                },
                "segments": segments,
                "remarks": remarks,
            }
        )
        current_date += timedelta(days=1)

    # Independent per-day rounding can lose a few hundredths. Reconcile the
    # final sheet so the public invariant is exact at API precision.
    target_miles = round(route_distance_miles, 2)
    rounded_sum = round(sum(float(log["total_miles"]) for log in logs), 2)
    adjustment_index = next(
        (
            index
            for index in range(len(logs) - 1, -1, -1)
            if float(logs[index]["total_miles"]) > 0
        ),
        len(logs) - 1,
    )
    logs[adjustment_index]["total_miles"] = round(
        float(logs[adjustment_index]["total_miles"]) + target_miles - rounded_sum, 2
    )
    return logs


def _overlaps(event: DutyEvent, day_start: datetime, day_end: datetime) -> bool:
    event_start = event.start_at.astimezone(UTC)
    event_end = event.end_at.astimezone(UTC)
    return event_start < day_end.astimezone(UTC) and event_end > day_start.astimezone(UTC)


def _segments_for_day(
    events: list[DutyEvent],
    day: date,
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
        local_start = overlap_start.astimezone(day_start.tzinfo)
        local_end = overlap_end.astimezone(day_start.tzinfo)
        start_minute = 0.0 if overlap_start == day_start_utc else _wall_minute(local_start, day)
        end_minute = 1440.0 if overlap_end == day_end_utc else _wall_minute(local_end, day)
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


def _wall_minute(value: datetime, day: date) -> float:
    naive = value.replace(tzinfo=None)
    midnight = datetime.combine(day, time.min)
    return (naive - midnight).total_seconds() / 60


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
    total_seconds = (event.end_at - event.start_at).total_seconds()
    overlap_seconds = (end - start).total_seconds()
    return event.miles_driven * overlap_seconds / total_seconds


def _remarks_for_day(
    events: list[DutyEvent],
    day: date,
    zone: ZoneInfo,
    *,
    trip_completed_at: datetime,
    final_location: str,
    final_status: DutyStatus,
) -> list[dict[str, object]]:
    remarks: list[dict[str, object]] = []
    for event in events:
        local_start = event.start_at.astimezone(zone)
        if local_start.date() == day:
            minute = local_start.hour * 60 + local_start.minute + local_start.second / 60
            note = event.note
        else:
            minute = 0.0
            note = f"Continued: {event.note}"
        remarks.append(
            {
                "event_id": event.id,
                "time": f"{int(minute // 60):02d}:{int(minute % 60):02d}",
                "minute": round(minute, 3),
                "status": event.status,
                "location": event.start_location,
                "note": note,
            }
        )

    completion = trip_completed_at.astimezone(zone)
    completion_minute = (
        completion.hour * 60 + completion.minute + completion.second / 60
    )
    if (
        completion.date() == day
        and completion_minute > 0
        and final_status != "off_duty"
    ):
        remarks.append(
            {
                "event_id": "trip-complete",
                "time": f"{completion.hour:02d}:{completion.minute:02d}",
                "minute": round(completion_minute, 3),
                "status": "off_duty",
                "location": final_location,
                "note": "Trip complete; Off Duty.",
            }
        )
    return remarks


def _cycle_at(
    events: list[DutyEvent], cutoff: datetime, initial_cycle_used_hours: float
) -> float:
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
