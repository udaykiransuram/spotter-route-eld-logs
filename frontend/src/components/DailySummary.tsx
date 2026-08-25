import { CheckCircle2, Gauge, Route } from "lucide-react";
import { formatMiles } from "../lib/format";
import type { DailyLog } from "../types";

export function DailySummary({ log, dayNumber }: { log: DailyLog; dayNumber: number }) {
  const statusRows = [
    { key: "driving", label: "Driving", value: log.status_totals.driving },
    { key: "on-duty", label: "On duty", value: log.status_totals.on_duty },
    { key: "off-duty", label: "Off duty", value: log.status_totals.off_duty },
    { key: "sleeper", label: "Sleeper berth", value: log.status_totals.sleeper_berth },
  ];
  const totalHours = statusRows.reduce((total, row) => total + row.value, 0);
  const cycleUsed = log.recap?.cycle_used_at_end ?? log.cycle_used_hours;
  const boundedCycleUsed = Math.min(70, Math.max(0, cycleUsed));
  const cyclePercent = (boundedCycleUsed / 70) * 100;

  return (
    <aside className="daily-summary" aria-labelledby="daily-summary-title">
      <header className="daily-summary__header">
        <div>
          <span>Daily totals</span>
          <h2 id="daily-summary-title">Day {dayNumber} summary</h2>
        </div>
        <span className="hours-verified"><CheckCircle2 size={16} aria-hidden="true" />{totalHours.toFixed(2)} h</span>
      </header>

      <div className="duty-allocation" aria-label={`Duty status allocation totals ${totalHours.toFixed(2)} hours`}>
        <div className="duty-allocation__bar" aria-hidden="true">
          {statusRows.map((row) => (
            <span className={`duty-allocation__segment duty-allocation__segment--${row.key}`} key={row.key} style={{ width: `${(row.value / 24) * 100}%` }} />
          ))}
        </div>
        <dl className="duty-allocation__legend">
          {statusRows.map((row) => (
            <div key={row.key}>
              <dt><span className={`status-dot status-dot--${row.key}`} aria-hidden="true" />{row.label}</dt>
              <dd>{row.value.toFixed(2)} h</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="summary-highlights">
        <div>
          <span className="summary-highlight__icon" aria-hidden="true"><Route size={19} /></span>
          <span><small>Miles</small><strong>{formatMiles(log.total_miles)}</strong></span>
        </div>
        <div>
          <span className="summary-highlight__icon" aria-hidden="true"><Gauge size={19} /></span>
          <span><small>Cycle used</small><strong>{cycleUsed.toFixed(2)} / 70 h</strong></span>
        </div>
      </div>

      <div className="cycle-progress">
        <div><span>70-hour cycle</span><strong>{Math.max(0, 70 - cycleUsed).toFixed(2)} h remaining</strong></div>
        <span className="cycle-progress__track" role="progressbar" aria-label="70-hour cycle used" aria-valuemin={0} aria-valuemax={70} aria-valuenow={boundedCycleUsed}>
          <span style={{ width: `${cyclePercent}%` }} />
        </span>
      </div>

      <div className="log-timezone">
        <span>Log timezone</span>
        <strong>{log.timezone.replaceAll("_", " ")}</strong>
      </div>
      <div className="certification-note">
        <span aria-hidden="true">i</span>
        <p>Generated trip plan — not a certified ELD record.</p>
      </div>
      {log.recap?.restart_completed ? <p className="restart-note">A 34-hour cycle restart completed on this day.</p> : null}
    </aside>
  );
}
