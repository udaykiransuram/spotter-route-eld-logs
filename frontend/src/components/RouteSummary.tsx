import { CalendarDays, CircleGauge, Clock3, MapPin, Route } from "lucide-react";
import { formatHours, formatMiles } from "../lib/format";
import type { TripSummary } from "../types";

interface RouteSummaryProps {
  summary: TripSummary;
}

export function RouteSummary({ summary }: RouteSummaryProps) {
  const metrics = [
    { label: "Distance", value: formatMiles(summary.distance_miles), Icon: Route },
    { label: "Driving time", value: formatHours(summary.driving_hours), Icon: CircleGauge },
    { label: "Total trip time", value: formatHours(summary.total_elapsed_hours), Icon: Clock3 },
    { label: "Trip days", value: String(summary.trip_days), Icon: CalendarDays },
    { label: "Stops", value: String(summary.stop_count), Icon: MapPin },
  ];

  return (
    <dl className="route-summary" aria-label="Trip summary">
      {metrics.map(({ label, value, Icon }) => (
        <div className="route-summary__metric" key={label}>
          <Icon aria-hidden="true" />
          <span>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}
