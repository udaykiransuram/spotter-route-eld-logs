import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { ChevronLeft, ChevronRight, Expand, FileText, Minimize, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, Navigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import {
  formatLongLogDate,
  LogMetadataDetails,
  remarkDisplayTime,
} from "../components/DailyLogDetails";
import { DailyLogSheet } from "../components/DailyLogSheet";
import { DailySummary } from "../components/DailySummary";
import { dutyStatusLabels, formatDayLabel } from "../lib/format";
import { visibleLogRemarks } from "../lib/log-remarks";
import { usePlan } from "../state/plan-context";

export function DailyLogsPage() {
  const { plan } = usePlan();
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const logRegionRef = useRef<HTMLDivElement>(null);
  const dayTabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === logRegionRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const preparePrintSheets = () => flushSync(() => setPrintReady(true));
    const releasePrintSheets = () => setPrintReady(false);
    window.addEventListener("beforeprint", preparePrintSheets);
    window.addEventListener("afterprint", releasePrintSheets);
    return () => {
      window.removeEventListener("beforeprint", preparePrintSheets);
      window.removeEventListener("afterprint", releasePrintSheets);
    };
  }, []);

  useEffect(() => {
    const selectedTab = dayTabsRef.current?.querySelector<HTMLElement>(`#day-tab-${activeIndex}`);
    const scroller = dayTabsRef.current?.querySelector<HTMLElement>(".day-tabs");
    if (!selectedTab || !scroller) return;

    const selectedRect = selectedTab.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const centeredLeft = scroller.scrollLeft
      + selectedRect.left
      - scrollerRect.left
      - (scroller.clientWidth - selectedRect.width) / 2;
    const nextLeft = Math.max(0, Math.min(centeredLeft, scroller.scrollWidth - scroller.clientWidth));
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: nextLeft, behavior: "auto" });
    } else {
      scroller.scrollLeft = nextLeft;
    }
  }, [activeIndex]);

  if (!plan || plan.daily_logs.length === 0) return <Navigate to="/" replace />;
  const activeLog = plan.daily_logs[Math.min(activeIndex, plan.daily_logs.length - 1)];
  const origin = plan.request?.current_location.label ?? plan.daily_logs[0].from_location;
  const pickup = plan.request?.pickup_location.label;
  const destination = plan.request?.dropoff_location.label ?? plan.daily_logs.at(-1)?.to_location;
  const routeLabel = [origin, pickup, destination].filter(Boolean).join(" → ");
  const activeDate = formatLongLogDate(activeLog.date);
  const activeRemarks = visibleLogRemarks(activeLog.remarks);
  const panInstructionId = `log-pan-instruction-${activeIndex}`;
  const metadata = plan.metadata ?? plan.request?.metadata;

  const requestFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        if (!document.exitFullscreen) throw new Error("Fullscreen is unavailable.");
        await document.exitFullscreen();
      } else {
        if (!logRegionRef.current?.requestFullscreen) throw new Error("Fullscreen is unavailable.");
        await logRegionRef.current.requestFullscreen();
      }
      setFullscreenError(null);
    } catch {
      setFullscreenError("Full-screen view is not available in this browser. The log remains printable at full size.");
    }
  };

  const selectTab = (index: number) => {
    const nextIndex = Math.max(0, Math.min(plan.daily_logs.length - 1, index));
    setActiveIndex(nextIndex);
    document.getElementById(`day-tab-${nextIndex}`)?.focus();
  };

  const printLogs = () => {
    flushSync(() => setPrintReady(true));
    window.print();
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
            <Button
              className="secondary-button"
              color="inherit"
              startIcon={fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Expand size={18} aria-hidden="true" />}
              sx={{ "& .MuiButton-startIcon": { margin: 0 } }}
              type="button"
              variant="outlined"
              onClick={requestFullscreen}
            >
              {fullscreen ? "Exit full screen" : "View full screen"}
            </Button>
            <Button
              className="primary-button logs-print-button"
              color="inherit"
              disableElevation
              aria-describedby="print-log-scope"
              startIcon={<Printer size={18} aria-hidden="true" />}
              sx={{ "& .MuiButton-startIcon": { margin: 0 } }}
              type="button"
              variant="contained"
              onClick={printLogs}
            >
              Print / Save PDF
            </Button>
            <span className="sr-only" id="print-log-scope">Prints all {plan.daily_logs.length} daily log sheets, one sheet per page.</span>
          </div>
        </header>

        <nav className="day-tabs-nav" aria-label="Daily log navigation" ref={dayTabsRef}>
          <IconButton className="day-arrow" type="button" disabled={activeIndex === 0} onClick={() => selectTab(activeIndex - 1)} aria-label="Previous day"><ChevronLeft /></IconButton>
          <Tabs
            value={activeIndex}
            aria-label="Trip days"
            slotProps={{ list: { className: "day-tabs" } }}
            sx={{
              minHeight: 41,
              minWidth: 0,
              "& .MuiTabs-indicator": { display: "none" },
              "& .MuiTabs-scroller": { minHeight: 41 },
            }}
            onChange={(_, index: number) => setActiveIndex(index)}
          >
            {plan.daily_logs.map((log, index) => (
              <Tab
                id={`day-tab-${index}`}
                key={log.date}
                aria-controls={`day-panel-${index}`}
                disableFocusRipple
                disableRipple
                label={formatDayLabel(log.date, index + 1)}
                value={index}
                onKeyDown={(event) => {
                  const targetIndex = {
                    ArrowLeft: activeIndex - 1,
                    ArrowRight: activeIndex + 1,
                    Home: 0,
                    End: plan.daily_logs.length - 1,
                  }[event.key];
                  if (targetIndex === undefined) return;
                  event.preventDefault();
                  event.stopPropagation();
                  selectTab(targetIndex);
                }}
              />
            ))}
          </Tabs>
          <IconButton className="day-arrow" type="button" disabled={activeIndex === plan.daily_logs.length - 1} onClick={() => selectTab(activeIndex + 1)} aria-label="Next day"><ChevronRight /></IconButton>
        </nav>

        {fullscreenError ? <div className="form-alert form-alert--error" role="alert">{fullscreenError}</div> : null}

        <div
          className="log-stage"
          ref={logRegionRef}
          id={`day-panel-${activeIndex}`}
          role="tabpanel"
          aria-labelledby={`day-tab-${activeIndex}`}
        >
          {fullscreen ? (
            <Button
              className="fullscreen-exit-control"
              color="inherit"
              startIcon={<Minimize size={18} aria-hidden="true" />}
              type="button"
              variant="contained"
              onClick={requestFullscreen}
            >
              Exit full screen
            </Button>
          ) : null}
          <DailySummary log={activeLog} dayNumber={activeIndex + 1} />
          <Paper className="log-stage__paper" elevation={0}>
            <div className="log-document-bar">
              <div className="log-document-bar__title">
                <span className="log-document-icon" aria-hidden="true"><FileText size={19} /></span>
                <div>
                  <strong>Driver's daily log</strong>
                  <span>{activeDate} · {activeLog.timezone.replaceAll("_", " ")}</span>
                </div>
              </div>
              <span className="log-sheet-count">Sheet {activeIndex + 1} of {plan.daily_logs.length}</span>
            </div>
            <div className="log-paper-canvas">
              <p className="log-pan-instruction" id={panInstructionId}>The paper log fits the screen. Use full screen to inspect small details.</p>
              <div
                className="log-paper-scroll"
                role="region"
                aria-label="Driver's daily log sheet"
                aria-describedby={panInstructionId}
                tabIndex={0}
              >
                <div className="log-paper-scroll__inner">
                  <DailyLogSheet log={activeLog} metadata={metadata} />
                </div>
              </div>
            </div>
            <LogMetadataDetails metadata={metadata} />
            <section className="remarks-list" aria-labelledby="remarks-title">
              <header className="remarks-list__header">
                <div>
                  <h2 id="remarks-title">Duty-status remarks</h2>
                  <p>Times shown in {activeLog.timezone.replaceAll("_", " ")}.</p>
                </div>
                <span>{activeRemarks.length} {activeRemarks.length === 1 ? "entry" : "entries"}</span>
              </header>
              {activeLog.grid_note ? (
                <div className="log-grid-note" role="note" aria-label="Daylight-saving time-grid note">
                  <strong>Daylight-saving time-grid note</strong>
                  <p>{activeLog.grid_note}</p>
                </div>
              ) : null}
              {activeRemarks.length > 0 ? (
                <ol>
                  {activeRemarks.map((remark, index) => (
                    <li className={`remark-item remark-item--${remark.status}`} key={`${remark.time}-${index}`}>
                      <span className="remark-item__marker" aria-hidden="true" />
                      <time>{remarkDisplayTime(remark)}</time>
                      <div>
                        <strong>
                          {remark.location || "Location unavailable"} — {remark.activity || dutyStatusLabels[remark.status]}
                        </strong>
                        <p>{remark.note}</p>
                        <span>{dutyStatusLabels[remark.status]}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p>No duty-status changes recorded.</p>}
            </section>
          </Paper>
        </div>
        {printReady ? (
          <div className="print-all-logs" aria-hidden="true">
            {plan.daily_logs.map((log) => (
              <div className="print-log-page" key={log.date}>
                <DailyLogSheet log={log} metadata={metadata} />
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
