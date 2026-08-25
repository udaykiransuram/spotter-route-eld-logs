import type { DailyLog, DailyLogRemark, TripMetadata } from "../types";
import { memo, useId } from "react";
import { DailyLogTemplate, LOG_GRAPH_LEFT, LOG_GRAPH_WIDTH, LOG_LANE_Y } from "./DailyLogTemplate";

interface DailyLogSheetProps {
  log: DailyLog;
  metadata?: TripMetadata;
}

interface PaperValue {
  lines: string[];
  truncated: boolean;
}

const regionAbbreviations: Record<string, string> = {
  england: "ENG",
  scotland: "SCT",
  wales: "WLS",
  "northern ireland": "NIR",
};
const unsupportedRecapFieldXs = [165.5, 204.5, 245.5, 323.5, 362.5, 403.5] as const;

function wrapForSheet(value: string, charactersPerLine: number, maxLines: number): PaperValue {
  let remaining = value.trim().replace(/\s+/g, " ");
  const lines: string[] = [];

  while (remaining && lines.length < maxLines) {
    if (remaining.length <= charactersPerLine) {
      lines.push(remaining);
      remaining = "";
      break;
    }
    const candidate = remaining.slice(0, charactersPerLine + 1);
    const spaceIndex = candidate.lastIndexOf(" ");
    const breakIndex = spaceIndex >= Math.floor(charactersPerLine * 0.55) ? spaceIndex : charactersPerLine;
    lines.push(remaining.slice(0, breakIndex).trimEnd());
    remaining = remaining.slice(breakIndex).trimStart();
  }

  const truncated = remaining.length > 0;
  if (truncated && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].slice(0, charactersPerLine - 1).trimEnd()}…`;
  }
  return { lines: lines.length ? lines : [""], truncated };
}

function fitForPaper(value: string, characters: number): PaperValue {
  return wrapForSheet(value, characters, 1);
}

function locationForPaperField(value: string) {
  const trimmed = value.trim();
  if (/^route mile\s+[\d,\s]+$/i.test(trimmed)) return trimmed.replace(/,\s+/g, ",");
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const stateIndex = parts.findIndex((part) => /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(part));
  if (stateIndex > 0) return `${parts[stateIndex - 1]}, ${parts[stateIndex].slice(0, 2)}`;
  if (parts.length >= 2) {
    const withoutCountry = parts.length >= 3 ? parts.slice(0, -1) : parts;
    if (withoutCountry.length === 1) return withoutCountry[0];
    const city = withoutCountry.at(-2) ?? withoutCountry[0];
    const region = withoutCountry.at(-1) ?? "";
    const shortRegion = regionAbbreviations[region.toLocaleLowerCase()] ?? region;
    return `${city}, ${shortRegion}`;
  }
  return value;
}

function paperRemarkSummary(remark: DailyLogRemark) {
  const note = remark.note;
  let summary: string;
  if (/30-minute break/i.test(note)) summary = "30-minute break";
  else if (/10 consecutive hours off duty/i.test(note)) summary = "10-hour rest";
  else if (/pickup/i.test(note)) summary = "Pickup - on duty";
  else if (/drop-?off/i.test(note)) summary = "Drop-off - on duty";
  else if (/fuel stop/i.test(note)) summary = "Fuel stop";
  else if (/trip complete/i.test(note)) summary = "Trip complete - off duty";
  else if (/drive toward/i.test(note)) {
    const destination = note.match(/drive toward\s+(.+?)(?:\.|$)/i)?.[1] ?? "next stop";
    summary = `Drive to ${locationForPaperField(destination)}`;
  } else {
    summary = note.split(/[.;]/, 1)[0] || "Duty-status change";
  }
  const location = remark.location ? locationForPaperField(remark.location) : "";
  return location ? `${summary} - ${location}` : summary;
}

function xForMinute(minute: number) {
  const normalized = Math.min(1440, Math.max(0, minute));
  return LOG_GRAPH_LEFT + (normalized / 1440) * LOG_GRAPH_WIDTH;
}

function LogTrace({ log }: { log: DailyLog }) {
  return (
    <g className="log-trace" fill="none" stroke="#0b6fe8" strokeWidth="2.25" strokeLinejoin="round">
      {log.segments.map((segment, index) => {
        const next = log.segments[index + 1];
        const startX = xForMinute(segment.start_minute);
        const endX = xForMinute(segment.end_minute);
        const y = LOG_LANE_Y[segment.status];
        return (
          <g key={`${segment.status}-${segment.start_minute}-${segment.end_minute}`}>
            <line data-trace-segment x1={startX} y1={y} x2={endX} y2={y} />
            {next && next.start_minute === segment.end_minute ? (
              <line data-trace-transition x1={endX} y1={y} x2={endX} y2={LOG_LANE_Y[next.status]} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

export const DailyLogSheet = memo(function DailyLogSheet({ log, metadata = {} }: DailyLogSheetProps) {
  const captionId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const date = new Date(`${log.date}T12:00:00`);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  const totals = log.status_totals;
  const onDutyToday = log.recap?.on_duty_today ?? totals.driving + totals.on_duty;
  const totalHours = totals.off_duty + totals.sleeper_berth + totals.driving + totals.on_duty;
  const clipId = useId().replaceAll(":", "");
  const fromLocation = fitForPaper(locationForPaperField(log.from_location), 42);
  const toLocation = fitForPaper(locationForPaperField(log.to_location), 42);
  const carrier = wrapForSheet(metadata.carrier_name ?? "", 58, 2);
  const mainOffice = fitForPaper(metadata.main_office_address ?? "", 62);
  const homeTerminal = fitForPaper(metadata.home_terminal_address ?? "", 62);
  const vehicleNumber = fitForPaper(metadata.vehicle_number ?? "", 38);
  const shippingDocument = fitForPaper(metadata.shipping_document_number ?? "", 22);
  const driver = fitForPaper(metadata.driver_name ? `Driver: ${metadata.driver_name}` : "", 54);
  const hasPaperFieldContinuation = [
    fromLocation,
    toLocation,
    carrier,
    mainOffice,
    homeTerminal,
    vehicleNumber,
    shippingDocument,
    driver,
  ].some((value) => value.truncated);
  const paperRemarkLimit = 7;
  const hasContinuation = log.remarks.length > paperRemarkLimit;
  const paperRemarks = log.remarks.slice(0, hasContinuation ? paperRemarkLimit - 1 : paperRemarkLimit);
  const paperRemarkValues = paperRemarks.map((remark) => fitForPaper(paperRemarkSummary(remark), 88).lines[0]);

  return (
    <figure className="log-sheet" aria-labelledby={captionId}>
      <svg viewBox="0 0 513 518" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
        <title id={titleId}>Filled driver's daily log for {log.date}</title>
        <desc id={descriptionId}>
          Vector daily log totaling {totalHours.toFixed(2)} hours with {totals.driving.toFixed(2)} hours driving,
          {` ${totals.on_duty.toFixed(2)} hours on duty, ${totals.off_duty.toFixed(2)} hours off duty, and ${totals.sleeper_berth.toFixed(2)} hours in the sleeper berth.`}
        </desc>
        <DailyLogTemplate />
        <defs>
          <clipPath id={`${clipId}-from`}><rect x="72" y="33" width="169" height="14" /></clipPath>
          <clipPath id={`${clipId}-to`}><rect x="273" y="33" width="164" height="14" /></clipPath>
          <clipPath id={`${clipId}-carrier`}><rect x="228" y="62" width="238" height="17" /></clipPath>
          <clipPath id={`${clipId}-office`}><rect x="228" y="81" width="238" height="18" /></clipPath>
          <clipPath id={`${clipId}-terminal`}><rect x="228" y="101" width="238" height="19" /></clipPath>
          <clipPath id={`${clipId}-vehicle`}><rect x="53" y="100" width="164" height="20" /></clipPath>
          <clipPath id={`${clipId}-driver`}><rect x="52" y="132" width="288" height="17" /></clipPath>
          <clipPath id={`${clipId}-shipping`}><rect x="24" y="337" width="72" height="17" /></clipPath>
          <clipPath id={`${clipId}-remarks`}><rect x="104" y="284" width="353" height="94" /></clipPath>
        </defs>
        <g className="log-overlay-text" fill="#06152d" fontFamily="Arial, Helvetica, sans-serif">
          <text data-paper-field="date-month" x="187" y="17.5" textAnchor="middle" fontSize="8" fontWeight="700">{month}</text>
          <text data-paper-field="date-day" x="229" y="17.5" textAnchor="middle" fontSize="8" fontWeight="700">{day}</text>
          <text data-paper-field="date-year" x="271.5" y="17.5" textAnchor="middle" fontSize="8" fontWeight="700">{year}</text>

          <text data-paper-field="from" x="156" y="44" textAnchor="middle" fontSize="6.5" fontWeight="600" clipPath={`url(#${clipId}-from)`} textLength={fromLocation.truncated ? 159 : undefined} lengthAdjust={fromLocation.truncated ? "spacingAndGlyphs" : undefined}>{fromLocation.lines[0]}</text>
          <text data-paper-field="to" x="355" y="44" textAnchor="middle" fontSize="6.5" fontWeight="600" clipPath={`url(#${clipId}-to)`} textLength={toLocation.truncated ? 154 : undefined} lengthAdjust={toLocation.truncated ? "spacingAndGlyphs" : undefined}>{toLocation.lines[0]}</text>

          <text data-paper-field="total-miles-driving-today" x="94" y="79" textAnchor="middle" fontSize="10" fontWeight="700">{Math.round(log.total_miles)}</text>
          <text data-paper-field="total-mileage-today" x="181" y="79" textAnchor="middle" fontSize="10" fontWeight="700">{Math.round(log.total_miles)}</text>
          <text
            data-paper-field="vehicle"
            x="135"
            y="115"
            textAnchor="middle"
            fontSize="7"
            fontWeight="600"
            clipPath={`url(#${clipId}-vehicle)`}
            textLength={vehicleNumber.truncated ? 150 : undefined}
            lengthAdjust={vehicleNumber.truncated ? "spacingAndGlyphs" : undefined}
          >
            {vehicleNumber.lines[0]}
          </text>

          <text data-paper-field="carrier" x="232" y={carrier.lines.length > 1 ? 68.5 : 76} fontSize="6.25" fontWeight="600" clipPath={`url(#${clipId}-carrier)`}>
            {carrier.lines.map((line, index) => <tspan key={index} x="232" dy={index ? 7.2 : 0} textLength={carrier.truncated ? 228 : undefined} lengthAdjust={carrier.truncated ? "spacingAndGlyphs" : undefined}>{line}</tspan>)}
          </text>
          <text data-paper-field="main-office" x="232" y="97" fontSize="6.25" fontWeight="600" clipPath={`url(#${clipId}-office)`} textLength={mainOffice.truncated ? 228 : undefined} lengthAdjust={mainOffice.truncated ? "spacingAndGlyphs" : undefined}>{mainOffice.lines[0]}</text>
          <text data-paper-field="home-terminal" x="232" y="117" fontSize="6.25" fontWeight="600" clipPath={`url(#${clipId}-terminal)`} textLength={homeTerminal.truncated ? 228 : undefined} lengthAdjust={homeTerminal.truncated ? "spacingAndGlyphs" : undefined}>{homeTerminal.lines[0]}</text>
          <text data-paper-field="driver" x="52" y="143" fontSize="6.25" fontWeight="700" clipPath={`url(#${clipId}-driver)`} textLength={driver.truncated ? 278 : undefined} lengthAdjust={driver.truncated ? "spacingAndGlyphs" : undefined}>{driver.lines[0]}</text>
          {hasPaperFieldContinuation ? (
            <text data-paper-continuation x="466" y="143" textAnchor="end" fontSize="4.6" fontWeight="700">… full value in on-screen details</text>
          ) : null}

          <text x="478" y="195" textAnchor="middle" fontSize="8" fontWeight="700">{totals.off_duty.toFixed(2)}</text>
          <text x="478" y="212" textAnchor="middle" fontSize="8" fontWeight="700">{totals.sleeper_berth.toFixed(2)}</text>
          <text x="478" y="229" textAnchor="middle" fontSize="8" fontWeight="700">{totals.driving.toFixed(2)}</text>
          <text x="478" y="247" textAnchor="middle" fontSize="8" fontWeight="700">{totals.on_duty.toFixed(2)}</text>

          <g clipPath={`url(#${clipId}-remarks)`}>
            {paperRemarks.map((remark, index) => (
              <text data-paper-remark key={`${remark.time}-${index}`} x="105" y={292 + index * 13} fontSize="5.8">
                <tspan fontWeight="700">{remark.time}</tspan>
                <tspan dx="6">{paperRemarkValues[index]}</tspan>
              </text>
            ))}
            {hasContinuation ? (
              <text x="105" y={292 + (paperRemarkLimit - 1) * 13} fontSize="5.8" fontWeight="700">
                See on-screen remarks for {log.remarks.length - paperRemarks.length} more changes.
              </text>
            ) : null}
          </g>
          <text
            data-paper-field="shipping-document"
            x="60"
            y="349"
            textAnchor="middle"
            fontSize="6.5"
            fontWeight="600"
            clipPath={`url(#${clipId}-shipping)`}
            textLength={shippingDocument.truncated ? 64 : undefined}
            lengthAdjust={shippingDocument.truncated ? "spacingAndGlyphs" : undefined}
          >
            {shippingDocument.lines[0]}
          </text>
          <text data-paper-recap="on-duty-today" x="86" y="451" textAnchor="middle" fontSize="8" fontWeight="700">{onDutyToday.toFixed(2)}</text>
          {unsupportedRecapFieldXs.map((x, index) => (
            <text
              data-paper-recap="unsupported"
              key={`unsupported-recap-${index}`}
              x={x}
              y="451"
              textAnchor="middle"
              fontSize="7"
              fontWeight="600"
              fill="#64748b"
            >
              —
            </text>
          ))}
        </g>
        <LogTrace log={log} />
      </svg>
      <figcaption id={captionId} className="sr-only">
        Driver log for {log.date}: {totals.driving} hours driving, {totals.on_duty} hours on duty,{" "}
        {totals.off_duty} hours off duty, and {totals.sleeper_berth} hours in the sleeper berth.
      </figcaption>
    </figure>
  );
});
