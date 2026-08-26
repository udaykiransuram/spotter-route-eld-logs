import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import { FileText } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { dutyStatusLabels, formatDayLabel, formatDuration, formatTime, stopTypeLabels } from "../lib/format";
import type { ScheduledStop, TripPlan } from "../types";
import { StopTypeIcon } from "./stop-type-icon";

interface ItineraryPanelProps {
  plan: TripPlan;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
}

interface StopDay {
  date: string;
  stops: ScheduledStop[];
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatterFor(timezone?: string) {
  const key = timezone ?? "local";
  const existing = dateFormatters.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  });
  dateFormatters.set(key, formatter);
  return formatter;
}

function preloadDailyLogs() {
  void import("../pages/DailyLogsPage");
}

function groupStopsByDay(stops: ScheduledStop[], timezone?: string): StopDay[] {
  const groups = new Map<string, ScheduledStop[]>();
  const dateFormatter = dateFormatterFor(timezone);

  for (const stop of stops) {
    const parts = dateFormatter.formatToParts(new Date(stop.scheduled_at));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    const current = groups.get(date) ?? [];
    current.push(stop);
    groups.set(date, current);
  }
  return Array.from(groups, ([date, groupedStops]) => ({ date, stops: groupedStops }));
}

function localDateForIso(iso: string, timezone?: string) {
  const parts = dateFormatterFor(timezone).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function ItineraryPanel({ plan, selectedStopId, onSelectStop }: ItineraryPanelProps) {
  const timezone = plan.daily_logs[0]?.timezone;
  const grouped = useMemo(() => groupStopsByDay(plan.stops, timezone), [plan.stops, timezone]);
  const pretripByStart = useMemo(() => new Map(
    plan.duty_events
      .filter((event) => event.event_type === "pretrip_inspection")
      .map((event) => [event.start_at, event]),
  ), [plan.duty_events]);
  const initialPretrip = pretripByStart.get(plan.summary.departure_at);
  const arrivalDate = useMemo(
    () => localDateForIso(plan.summary.arrival_at, timezone),
    [plan.summary.arrival_at, timezone],
  );
  const lastStopDate = grouped.at(-1)?.date;
  const arrivalDayIndex = Math.max(0, plan.daily_logs.findIndex((log) => log.date === arrivalDate));

  useEffect(() => {
    if (!selectedStopId) return;
    if (window.matchMedia("(max-width: 760px)").matches) return;
    document.getElementById(`itinerary-stop-${selectedStopId}`)?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [selectedStopId]);

  return (
    <Paper
      className="itinerary-panel"
      component="aside"
      elevation={0}
      square
      aria-labelledby="route-plan-title"
    >
      <div className="itinerary-panel__header">
        <h2 id="route-plan-title">Route plan</h2>
        <Button
          className="primary-button secondary-button--compact itinerary-panel__logs-link"
          component={Link}
          disableElevation
          onFocus={preloadDailyLogs}
          onMouseEnter={preloadDailyLogs}
          to="/logs"
          variant="contained"
        >
          <FileText size={16} aria-hidden="true" /> View daily logs ({plan.daily_logs.length})
        </Button>
      </div>

      <div className="itinerary" aria-label="Scheduled route stops">
        <div className="itinerary-start">
          <span aria-hidden="true" className="stop-number">
            <StopTypeIcon type="start" />
          </span>
          <span>
            <strong>Current location</strong>
            <small>{plan.request?.current_location.label ?? plan.duty_events[0]?.start_location}</small>
            {initialPretrip ? (
              <span className="itinerary-activity">
                Pre-trip inspection · {formatDuration((initialPretrip.duration_hours ?? 0.5) * 60)} · On Duty
              </span>
            ) : null}
          </span>
          <time>{formatTime(plan.summary.departure_at, timezone)}</time>
        </div>
        {grouped.map((day) => {
          const logDayIndex = plan.daily_logs.findIndex((log) => log.date === day.date);
          const dayNumber = logDayIndex >= 0 ? logDayIndex + 1 : 1;
          return (
          <section className="itinerary-day" key={day.date}>
            <h3>Day {dayNumber} · {formatDayLabel(day.date)}</h3>
            {day.stops.map((stop) => {
              const followingPretrip = stop.end_at ? pretripByStart.get(stop.end_at) : undefined;
              return (
              <ButtonBase
                id={`itinerary-stop-${stop.id}`}
                className={`itinerary-stop ${selectedStopId === stop.id ? "itinerary-stop--selected" : ""}`}
                key={stop.id}
                type="button"
                onClick={() => onSelectStop(stop.id)}
                aria-pressed={selectedStopId === stop.id}
              >
                <span aria-hidden="true" className={`stop-number stop-number--${stop.type}`}>
                  <StopTypeIcon type={stop.type} />
                  <span className="stop-number__sequence">{stop.sequence}</span>
                </span>
                <span className="itinerary-stop__main">
                  <strong>{stopTypeLabels[stop.type]}</strong>
                  <small>{stop.label}</small>
                  <span className="itinerary-stop__reason">{stop.reason}</span>
                  {followingPretrip ? (
                    <span className="itinerary-activity">
                      Next shift: Pre-trip inspection · {formatDuration((followingPretrip.duration_hours ?? 0.5) * 60)} · On Duty
                    </span>
                  ) : null}
                </span>
                <span className="itinerary-stop__meta">
                  <time>{formatTime(stop.scheduled_at, timezone)}</time>
                  <small>{formatDuration(stop.duration_minutes)}</small>
                  <em className={`status-tag ${stop.type === "rest" ? "status-tag--mixed" : `status-tag--${stop.duty_status}`}`}>
                    {stop.type === "rest" ? "Off Duty + Sleeper" : dutyStatusLabels[stop.duty_status]}
                  </em>
                </span>
              </ButtonBase>
              );
            })}
          </section>
          );
        })}
        {lastStopDate !== arrivalDate ? <h3 className="itinerary-final-day">Day {arrivalDayIndex + 1} · {formatDayLabel(arrivalDate)}</h3> : null}
        <div className="itinerary-end">
          <span className="stop-number stop-number--finish" aria-hidden="true">
            <StopTypeIcon type="finish" />
          </span>
          <span><strong>End of trip</strong><small>{plan.request?.dropoff_location.label ?? plan.duty_events.at(-1)?.end_location}</small></span>
          <time>{formatTime(plan.summary.arrival_at, timezone)}</time>
        </div>
      </div>
      <p className="itinerary-panel__attribution">Routing: {plan.attribution.routing}</p>
    </Paper>
  );
}
