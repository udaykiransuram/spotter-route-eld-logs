import Paper from "@mui/material/Paper";
import { CalendarDays, CircleGauge, Clock3, MapPin, Route } from "lucide-react";
import { memo } from "react";
import { formatHours, formatMiles } from "../lib/format";
import type { TripSummary } from "../types";

interface RouteSummaryProps {
  summary: TripSummary;
}

export const RouteSummary = memo(function RouteSummary({ summary }: RouteSummaryProps) {
  const metrics = [
    { label: "Distance", value: formatMiles(summary.distance_miles), Icon: Route },
    { label: "Driving time", value: formatHours(summary.driving_hours), Icon: CircleGauge },
    { label: "Total trip time", value: formatHours(summary.total_elapsed_hours), Icon: Clock3 },
    { label: "Trip days", value: String(summary.trip_days), Icon: CalendarDays },
    { label: "Stops", value: String(summary.stop_count), Icon: MapPin },
  ];

  return (
    <Paper className="route-summary" component="dl" elevation={0} aria-label="Trip summary">
      {metrics.map(({ label, value, Icon }) => (
        <div className="route-summary__metric" key={label}>
          <Icon aria-hidden="true" />
          <span>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </span>
        </div>
      ))}
    </Paper>
  );
});
