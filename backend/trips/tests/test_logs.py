from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from trips.logs import build_daily_logs
from trips.scheduler import schedule_route
from trips.tests.test_scheduler import make_route


def test_cross_midnight_logs_are_complete_and_reconcile_mileage() -> None:
    departure = datetime(2026, 8, 25, 23, 30, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(2, 3)
    events = schedule_route(route, departure, 12)
    logs = build_daily_logs(events, "America/Chicago", route.distance_miles, 12)

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
    departure = datetime.fromisoformat("2026-08-26T03:30:00+00:00")
    route = make_route(1, 1)
    events = schedule_route(route, departure, 0)
    logs = build_daily_logs(events, "America/New_York", route.distance_miles, 0)

    assert logs[0]["date"] == "2026-08-25"
    first_driving = next(
        segment for segment in logs[0]["segments"] if segment["status"] == "driving"
    )
    assert first_driving["start_minute"] == pytest.approx(23.5 * 60)


def test_cycle_recap_is_reset_aware() -> None:
    departure = datetime(2026, 8, 25, 6, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(1, 1)
    events = schedule_route(route, departure, 70)
    logs = build_daily_logs(events, "America/Chicago", route.distance_miles, 70)

    assert logs[0]["recap"]["cycle_used_at_start"] == 70
    assert any(log["recap"]["restart_completed"] for log in logs)
    assert logs[-1]["recap"]["cycle_used_at_end"] == pytest.approx(4)
    assert logs[-1]["recap"]["remaining_cycle_hours"] == pytest.approx(66)


def test_remarks_include_continued_status_at_midnight() -> None:
    departure = datetime(2026, 8, 25, 18, tzinfo=ZoneInfo("America/Denver"))
    route = make_route(6, 12)
    events = schedule_route(route, departure, 0)
    logs = build_daily_logs(events, "America/Denver", route.distance_miles, 0)

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
    logs = build_daily_logs(events, "America/Chicago", route.distance_miles, 0)

    assert len(logs) == 2
    assert logs[-1]["total_miles"] == 0
    assert sum(log["total_miles"] for log in logs) == pytest.approx(route.distance_miles)


def test_post_trip_off_duty_trace_has_matching_accessible_remark() -> None:
    departure = datetime(2026, 8, 25, 6, tzinfo=ZoneInfo("America/Chicago"))
    route = make_route(1, 1)
    events = schedule_route(route, departure, 0)
    log = build_daily_logs(events, "America/Chicago", route.distance_miles, 0)[0]

    completion_remark = log["remarks"][-1]
    assert completion_remark["status"] == "off_duty"
    assert completion_remark["location"] == "Drop-off"
    assert completion_remark["note"] == "Trip complete; Off Duty."
    assert completion_remark["minute"] == log["segments"][-1]["start_minute"]
