from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from trips.domain import DutyEvent, Location, RouteLeg, RouteResult
from trips.logs import build_daily_logs, collect_log_location_points
from trips.scheduler import schedule_route
from trips.tests.test_scheduler import make_route


def test_cross_midnight_logs_are_complete_and_reconcile_mileage() -> None:
    departure = datetime(2026, 8, 25, 23, 30, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(2, 3)
    events = schedule_route(route, departure, 12)
    logs = build_daily_logs(events, "America/Chicago", route, 12)

    assert [log["date"] for log in logs] == ["2026-08-25", "2026-08-26"]
    assert sum(float(log["total_miles"]) for log in logs) == pytest.approx(
        round(route.distance_miles, 2)
    )
    for log in logs:
        assert sum(log["status_totals"].values()) == pytest.approx(24)
        assert log["segments"][0]["start_minute"] == 0
        assert log["segments"][-1]["end_minute"] == 1440
        assert all(
            left["end_minute"] == right["start_minute"]
            for left, right in zip(log["segments"], log["segments"][1:])
        )


def test_log_grid_uses_home_terminal_timezone_for_aware_departure() -> None:
    departure = datetime.fromisoformat("2026-08-26T03:00:00+00:00")
    route = make_route(1, 1)
    events = schedule_route(route, departure, 0)
    logs = build_daily_logs(events, "America/New_York", route, 0)

    assert logs[0]["date"] == "2026-08-25"
    first_driving = next(
        segment for segment in logs[0]["segments"] if segment["status"] == "driving"
    )
    assert first_driving["start_minute"] == pytest.approx(23.5 * 60)


def test_cycle_recap_is_reset_aware() -> None:
    departure = datetime(2026, 8, 25, 6, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(1, 1)
    events = schedule_route(route, departure, 70)
    logs = build_daily_logs(events, "America/Chicago", route, 70)

    first_recap = logs[0]["recap"]
    assert first_recap["cycle_used_at_start"] == 70
    assert first_recap["seventy_hour_a"] == 70
    assert first_recap["seventy_hour_b"] == 0
    assert first_recap["seventy_hour_c"] == 70
    assert any(log["recap"]["restart_completed"] for log in logs)
    final_recap = logs[-1]["recap"]
    assert final_recap["cycle_used_at_end"] == pytest.approx(4.5)
    assert final_recap["remaining_cycle_hours"] == pytest.approx(65.5)
    assert final_recap["seventy_hour_a"] == pytest.approx(4.5)
    assert final_recap["seventy_hour_b"] == pytest.approx(65.5)
    assert final_recap["seventy_hour_c"] == pytest.approx(4.5)
    assert final_recap["estimated"] is True
    assert "no prior hours are assumed to age out" in final_recap["estimate_basis"]


def test_remarks_include_continued_status_at_midnight() -> None:
    departure = datetime(2026, 8, 25, 18, tzinfo=ZoneInfo("America/Denver"))
    route = make_route(6, 12)
    events = schedule_route(route, departure, 0)
    logs = build_daily_logs(events, "America/Denver", route, 0)

    later_logs = logs[1:]
    assert later_logs
    assert any(
        remark["time"] == "00:00" and remark["note"].startswith("Continued:")
        for log in later_logs
        for remark in log["remarks"]
    )


def test_completion_day_with_only_dropoff_never_gets_negative_mileage() -> None:
    departure = datetime(2026, 8, 25, 20, 30, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(1, 1)
    events = schedule_route(route, departure, 0)
    logs = build_daily_logs(events, "America/Chicago", route, 0)

    assert len(logs) == 2
    assert logs[-1]["total_miles"] == 0
    assert sum(log["total_miles"] for log in logs) == pytest.approx(route.distance_miles)


def test_tiny_multi_day_route_rounding_never_makes_a_sheet_negative() -> None:
    route = make_route(50, 50, speed=0.0005005)
    events = schedule_route(route, datetime(2026, 1, 1, 6, tzinfo=UTC), 0)

    logs = build_daily_logs(events, "UTC", route, 0)

    target_cents = int(round(round(route.distance_miles, 2) * 100))
    log_cents = [int(round(float(log["total_miles"]) * 100)) for log in logs]
    assert len(logs) > 1
    assert all(cents >= 0 for cents in log_cents)
    assert sum(log_cents) == target_cents


def test_projected_off_duty_after_dropoff_does_not_add_synthetic_remark() -> None:
    departure = datetime(2026, 8, 25, 6, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(1, 1)
    events = schedule_route(route, departure, 0)
    log = build_daily_logs(events, "America/Chicago", route, 0)[0]

    assert events[-1].event_type == "dropoff"
    assert not any(event.event_type.startswith("posttrip") for event in events)
    assert log["segments"][-1]["status"] == "off_duty"
    assert log["segments"][-2]["status"] == "on_duty"
    assert log["segments"][-2]["end_minute"] == log["segments"][-1]["start_minute"]
    assert log["segments"][-1]["end_minute"] == 1440
    completion = events[-1].end_at.astimezone(ZoneInfo("America/Chicago"))
    assert log["segments"][-1]["start_minute"] == pytest.approx(
        completion.hour * 60 + completion.minute + completion.second / 60
    )
    assert log["remarks"][-1]["activity"] == "Drop-off"
    assert not any(remark["event_id"] == "trip-complete" for remark in log["remarks"])
    assert not any(remark["activity"] == "Trip complete" for remark in log["remarks"])


def test_remarks_name_the_activity_and_location_for_each_duty_change() -> None:
    departure = datetime(2026, 8, 25, 6, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(2, 3)
    events = schedule_route(route, departure, 0)
    remarks = [
        remark
        for log in build_daily_logs(events, "America/Chicago", route, 0)
        for remark in log["remarks"]
    ]

    pretrip = next(remark for remark in remarks if remark["activity"] == "Pre-trip inspection")
    pickup = next(remark for remark in remarks if remark["activity"] == "Pickup")

    assert pretrip["location"] == "Current"
    assert pickup["location"] == "Pickup"
    assert all(remark["activity"] and remark["location"] for remark in remarks)


def test_on_duty_work_above_seventy_is_visible_until_restart_completes() -> None:
    departure = datetime(2026, 8, 25, 23, tzinfo=UTC)
    route = make_route(0.5, 1)
    events = schedule_route(route, departure, 69)

    logs = build_daily_logs(events, "UTC", route, 69)

    over_limit = next(log for log in logs if log["recap"]["cycle_used_at_end"] > 70)
    assert over_limit["date"] == "2026-08-26"
    assert over_limit["recap"]["cycle_used_at_end"] == pytest.approx(71)
    assert over_limit["recap"]["remaining_cycle_hours"] == 0
    assert over_limit["recap"]["restart_completed"] is False
    assert logs[-1]["recap"]["restart_completed"] is True
    assert logs[-1]["recap"]["cycle_used_at_end"] == pytest.approx(2.5)


@pytest.mark.parametrize("timezone_name", ["UTC", "America/New_York"])
def test_exact_midnight_completion_stays_on_prior_sheet(timezone_name: str) -> None:
    zone = ZoneInfo(timezone_name)
    departure = datetime(2026, 8, 25, 19, 30, tzinfo=zone)
    route = make_route(1, 1)
    events = schedule_route(route, departure, 0)

    logs = build_daily_logs(events, timezone_name, route, 0)

    assert events[-1].end_at.astimezone(zone) == datetime(2026, 8, 26, tzinfo=zone)
    assert [log["date"] for log in logs] == ["2026-08-25"]
    assert not any(remark["event_id"] == "trip-complete" for remark in logs[0]["remarks"])
    assert logs[0]["remarks"][-1]["activity"] == "Drop-off"
    assert logs[0]["remarks"][-1]["time"] == "23:00"
    assert logs[0]["segments"][-1] == {
        "status": "on_duty",
        "start_minute": 1380.0,
        "end_minute": 1440.0,
    }


def test_midnight_locations_and_continued_remark_use_actual_route_position() -> None:
    current = Location("Current", 0, 0)
    pickup = Location("Pickup", 0, 1)
    dropoff = Location("Drop-off", 0, 4)
    route = RouteResult(
        coordinates=(current.coordinate, pickup.coordinate, dropoff.coordinate),
        legs=(
            RouteLeg(0, current, pickup, 50, 1),
            RouteLeg(1, pickup, dropoff, 150, 3),
        ),
        instructions=(),
        distance_miles=200,
        duration_hours=4,
        attribution="test",
    )
    start = datetime(2026, 8, 25, 22, tzinfo=ZoneInfo("America/Denver"))
    event = DutyEvent(
        id="overnight-drive",
        status="driving",
        event_type="driving",
        start_at=start.astimezone(UTC),
        end_at=start.astimezone(UTC) + timedelta(hours=4),
        start_location=current.label,
        end_location=dropoff.label,
        start_coordinates=current.coordinate,
        end_coordinates=dropoff.coordinate,
        start_mile=0,
        end_mile=200,
        miles_driven=200,
        note="Overnight drive.",
    )

    location_points = collect_log_location_points(
        [event],
        "America/Denver",
        route,
    )
    assert list(location_points) == [100.0]
    assert location_points[100.0] == pytest.approx((2.0, 0.0))

    logs = build_daily_logs(
        [event],
        "America/Denver",
        route,
        0,
        resolved_route_locations={100.0: "Near I-40, Amarillo, TX"},
    )

    assert logs[0]["to_location"] == "Near I-40, Amarillo, TX"
    assert logs[1]["from_location"] == "Near I-40, Amarillo, TX"
    assert logs[1]["remarks"][0]["location"] == "Near I-40, Amarillo, TX"
    assert logs[1]["remarks"][0]["note"] == "Continued: Overnight drive."


def test_spring_forward_real_hour_remains_visible_on_24_hour_grid() -> None:
    route = make_route(0.5, 0.5, speed=60)
    start = datetime(2026, 3, 8, 6, 30, tzinfo=UTC)
    event = DutyEvent(
        id="spring-drive",
        status="driving",
        event_type="driving",
        start_at=start,
        end_at=start + timedelta(hours=1),
        start_location="Current",
        end_location="Drop-off",
        start_coordinates=route.coordinates[0],
        end_coordinates=route.coordinates[-1],
        start_mile=0,
        end_mile=60,
        miles_driven=60,
        note="Drive through spring-forward transition.",
    )

    log = build_daily_logs([event], "America/New_York", route, 0)[0]
    driving = next(segment for segment in log["segments"] if segment["status"] == "driving")
    projected_minutes = driving["end_minute"] - driving["start_minute"]

    assert projected_minutes == pytest.approx(60 / 23 * 24, abs=0.01)
    assert sum(log["status_totals"].values()) == pytest.approx(24)
    assert log["recap"]["on_duty_today"] == pytest.approx(1)
    assert "23-hour local day" in log["grid_note"]


def test_fall_back_repeated_hour_is_ordered_and_distinguished() -> None:
    route = make_route(0.5, 0.5, speed=60)
    start = datetime(2026, 11, 1, 5, 30, tzinfo=UTC)
    driving = DutyEvent(
        id="fall-drive",
        status="driving",
        event_type="driving",
        start_at=start,
        end_at=start + timedelta(hours=1),
        start_location="Current",
        end_location="Drop-off",
        start_coordinates=route.coordinates[0],
        end_coordinates=route.coordinates[-1],
        start_mile=0,
        end_mile=60,
        miles_driven=60,
        note="First repeated hour.",
    )
    on_duty = DutyEvent(
        id="fall-work",
        status="on_duty",
        event_type="dropoff",
        start_at=driving.end_at,
        end_at=driving.end_at + timedelta(hours=1),
        start_location="Drop-off",
        end_location="Drop-off",
        start_coordinates=route.coordinates[-1],
        end_coordinates=route.coordinates[-1],
        start_mile=60,
        end_mile=60,
        miles_driven=0,
        note="Second repeated hour.",
    )

    log = build_daily_logs([driving, on_duty], "America/New_York", route, 0)[0]
    driving_segment = next(segment for segment in log["segments"] if segment["status"] == "driving")
    projected_minutes = driving_segment["end_minute"] - driving_segment["start_minute"]

    assert projected_minutes == pytest.approx(60 / 25 * 24, abs=0.01)
    assert sum(log["status_totals"].values()) == pytest.approx(24)
    assert [remark["time"] for remark in log["remarks"][:2]] == ["01:30", "01:30"]
    assert [remark["timezone_abbreviation"] for remark in log["remarks"][:2]] == ["EDT", "EST"]
    assert log["remarks"][0]["minute"] < log["remarks"][1]["minute"]
    assert "25-hour local day" in log["grid_note"]
