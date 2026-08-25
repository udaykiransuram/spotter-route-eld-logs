import { FileText } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { dutyStatusLabels, formatDayLabel, formatDuration, formatTime, stopTypeLabels } from "../lib/format";
import type { ScheduledStop, TripPlan } from "../types";

interface ItineraryPanelProps {
  plan: TripPlan;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
}

interface StopDay {
  date: string;
  stops: ScheduledStop[];
}

function groupStopsByDay(stops: ScheduledStop[], timezone?: string): StopDay[] {
  const groups = new Map<string, ScheduledStop[]>();
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  });

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
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone,
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function ItineraryPanel({ plan, selectedStopId, onSelectStop }: ItineraryPanelProps) {
  const timezone = plan.daily_logs[0]?.timezone;
  const grouped = groupStopsByDay(plan.stops, timezone);
  const arrivalDate = localDateForIso(plan.summary.arrival_at, timezone);
  const lastStopDate = grouped.at(-1)?.date;
  const arrivalDayIndex = Math.max(0, plan.daily_logs.findIndex((log) => log.date === arrivalDate));

  useEffect(() => {
    if (!selectedStopId) return;
    document.getElementById(`itinerary-stop-${selectedStopId}`)?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [selectedStopId]);

  return (
    <aside className="itinerary-panel" aria-labelledby="route-plan-title">
      <div className="itinerary-panel__header">
        <h2 id="route-plan-title">Route plan</h2>
        <Link className="secondary-button secondary-button--compact" to="/logs">
          <FileText size={16} aria-hidden="true" /> View daily logs ({plan.daily_logs.length})
        </Link>
      </div>

      <div className="itinerary" aria-label="Scheduled route stops">
        <div className="itinerary-start">
          <span className="stop-number">S</span>
          <span><strong>Current location</strong><small>{plan.request?.current_location.label ?? plan.duty_events[0]?.start_location}</small></span>
          <time>{formatTime(plan.summary.departure_at, timezone)}</time>
        </div>
        {grouped.map((day) => {
          const logDayIndex = plan.daily_logs.findIndex((log) => log.date === day.date);
          const dayNumber = logDayIndex >= 0 ? logDayIndex + 1 : 1;
          return (
          <section className="itinerary-day" key={day.date}>
            <h3>Day {dayNumber} · {formatDayLabel(day.date)}</h3>
            {day.stops.map((stop) => (
              <button
                id={`itinerary-stop-${stop.id}`}
                className={`itinerary-stop ${selectedStopId === stop.id ? "itinerary-stop--selected" : ""}`}
                key={stop.id}
                type="button"
                onClick={() => onSelectStop(stop.id)}
                aria-pressed={selectedStopId === stop.id}
              >
                <span className={`stop-number stop-number--${stop.type}`}>{stop.sequence}</span>
                <span className="itinerary-stop__main">
                  <strong>{stopTypeLabels[stop.type]}</strong>
                  <small>{stop.label}</small>
                  <span className="itinerary-stop__reason">{stop.reason}</span>
                </span>
                <span className="itinerary-stop__meta">
                  <time>{formatTime(stop.scheduled_at, timezone)}</time>
                  <small>{formatDuration(stop.duration_minutes)}</small>
                  <em className={`status-tag status-tag--${stop.duty_status}`}>{dutyStatusLabels[stop.duty_status]}</em>
                </span>
              </button>
            ))}
          </section>
          );
        })}
        {lastStopDate !== arrivalDate ? <h3 className="itinerary-final-day">Day {arrivalDayIndex + 1} · {formatDayLabel(arrivalDate)}</h3> : null}
        <div className="itinerary-end">
          <span className="stop-number stop-number--finish" aria-hidden="true">✓</span>
          <span><strong>End of trip</strong><small>{plan.request?.dropoff_location.label ?? plan.duty_events.at(-1)?.end_location}</small></span>
          <time>{formatTime(plan.summary.arrival_at, timezone)}</time>
        </div>
      </div>
      <p className="itinerary-panel__attribution">Routing: {plan.attribution.routing}</p>
    </aside>
  );
}
