import { ChevronLeft, ChevronRight, Expand, Minimize, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { DailyLogSheet } from "../components/DailyLogSheet";
import { DailySummary } from "../components/DailySummary";
import { dutyStatusLabels, formatDayLabel } from "../lib/format";
import { usePlan } from "../state/plan-store";

export function DailyLogsPage() {
  const { plan } = usePlan();
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const logRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === logRegionRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  if (!plan || plan.daily_logs.length === 0) return <Navigate to="/" replace />;
  const activeLog = plan.daily_logs[Math.min(activeIndex, plan.daily_logs.length - 1)];
  const origin = plan.request?.current_location.label ?? plan.daily_logs[0].from_location;
  const pickup = plan.request?.pickup_location.label;
  const destination = plan.request?.dropoff_location.label ?? plan.daily_logs.at(-1)?.to_location;
  const routeLabel = [origin, pickup, destination].filter(Boolean).join(" → ");

  const requestFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await logRegionRef.current?.requestFullscreen?.();
    }
  };

  const selectTab = (index: number) => {
    const nextIndex = Math.max(0, Math.min(plan.daily_logs.length - 1, index));
    setActiveIndex(nextIndex);
    window.requestAnimationFrame(() => document.getElementById(`day-tab-${nextIndex}`)?.focus());
  };

  return (
    <div className="app-shell logs-app">
      <AppHeader />
      <main className="logs-page">
        <header className="logs-page__header">
          <div>
            <Link className="back-link" to="/"><ChevronLeft size={18} aria-hidden="true" />Back to route results</Link>
            <h1>Daily logs</h1>
            <p>{routeLabel} · {plan.daily_logs.length} {plan.daily_logs.length === 1 ? "day" : "days"}</p>
          </div>
          <div className="logs-page__actions">
            <button className="secondary-button" type="button" onClick={requestFullscreen}>
              {fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Expand size={18} aria-hidden="true" />}
              {fullscreen ? "Exit full screen" : "View full screen"}
            </button>
            <button className="secondary-button" type="button" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" />Print / Save PDF
            </button>
          </div>
        </header>

        <nav className="day-tabs-nav" aria-label="Daily log navigation">
          <button className="day-arrow" type="button" disabled={activeIndex === 0} onClick={() => selectTab(activeIndex - 1)} aria-label="Previous day"><ChevronLeft /></button>
          <div className="day-tabs" role="tablist" aria-label="Trip days">
            {plan.daily_logs.map((log, index) => (
              <button
                id={`day-tab-${index}`}
                key={log.date}
                type="button"
                role="tab"
                aria-selected={activeIndex === index}
                aria-controls={`day-panel-${index}`}
                tabIndex={activeIndex === index ? 0 : -1}
                onClick={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") selectTab(activeIndex - 1);
                  if (event.key === "ArrowRight") selectTab(activeIndex + 1);
                  if (event.key === "Home") selectTab(0);
                  if (event.key === "End") selectTab(plan.daily_logs.length - 1);
                }}
              >
                {formatDayLabel(log.date, index + 1)}
              </button>
            ))}
          </div>
          <button className="day-arrow" type="button" disabled={activeIndex === plan.daily_logs.length - 1} onClick={() => selectTab(activeIndex + 1)} aria-label="Next day"><ChevronRight /></button>
        </nav>

        <div
          className="log-stage"
          ref={logRegionRef}
          id={`day-panel-${activeIndex}`}
          role="tabpanel"
          aria-labelledby={`day-tab-${activeIndex}`}
        >
          <div className="log-stage__paper">
            <DailyLogSheet log={activeLog} metadata={plan.request?.metadata} />
            <section className="remarks-list" aria-labelledby="remarks-title">
              <h2 id="remarks-title">Remarks</h2>
              {activeLog.remarks.length > 0 ? (
                <ol>
                  {activeLog.remarks.map((remark, index) => (
                    <li key={`${remark.time}-${index}`}>
                      <time>{remark.time}</time>
                      <span><strong>{dutyStatusLabels[remark.status]}</strong>{remark.note} · {remark.location}</span>
                    </li>
                  ))}
                </ol>
              ) : <p>No duty-status changes recorded.</p>}
            </section>
          </div>
          <DailySummary log={activeLog} dayNumber={activeIndex + 1} />
        </div>
        <div className="print-all-logs" aria-hidden="true">
          {plan.daily_logs.map((log) => (
            <div className="print-log-page" key={log.date}>
              <DailyLogSheet log={log} metadata={plan.request?.metadata} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
