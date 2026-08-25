import { BedSingle, CircleGauge, Clock3, Gauge, Moon, Route } from "lucide-react";
import { formatMiles } from "../lib/format";
import type { DailyLog } from "../types";

export function DailySummary({ log, dayNumber }: { log: DailyLog; dayNumber: number }) {
  const rows = [
    { label: "Driving", value: `${log.status_totals.driving.toFixed(2)} h`, Icon: CircleGauge },
    { label: "On duty", value: `${log.status_totals.on_duty.toFixed(2)} h`, Icon: Clock3 },
    { label: "Off duty", value: `${log.status_totals.off_duty.toFixed(2)} h`, Icon: Moon },
    { label: "Sleeper berth", value: `${log.status_totals.sleeper_berth.toFixed(2)} h`, Icon: BedSingle },
    { label: "Miles", value: formatMiles(log.total_miles), Icon: Route },
    { label: "Cycle used", value: `${(log.recap?.cycle_used_at_end ?? log.cycle_used_hours).toFixed(2)} / 70 h`, Icon: Gauge },
  ];
  return (
    <aside className="daily-summary" aria-labelledby="daily-summary-title">
      <h2 id="daily-summary-title">Day {dayNumber} summary</h2>
      <dl>
        {rows.map(({ label, value, Icon }) => (
          <div key={label}><dt><Icon size={20} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <div className="certification-note">
        <span aria-hidden="true">i</span>
        <p>Generated trip plan — not a certified ELD record.</p>
      </div>
      {log.recap?.restart_completed ? <p className="restart-note">A 34-hour cycle restart completed on this day.</p> : null}
    </aside>
  );
}
