import type { DailyLog, TripMetadata } from "../types";
import { memo, useId } from "react";
import { visibleLogRemarks } from "../lib/log-remarks";
import { DailyLogTemplate } from "./DailyLogTemplate";
import { LogLocationTimeline, LogTrace } from "./DailyLogTimeline";

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
const seventyHourRecapFields = [
  { key: "a", x: 165.5 },
  { key: "b", x: 204.5 },
  { key: "c", x: 245.5 },
] as const;
const sixtyHourRecapFieldXs = [323.5, 362.5, 403.5] as const;

function nonNegativeHours(value: number | undefined, fallback: number) {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, candidate);
}

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

export const DailyLogSheet = memo(function DailyLogSheet({ log, metadata = {} }: DailyLogSheetProps) {
  const captionId = useId();
  const date = new Date(`${log.date}T12:00:00`);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  const totals = log.status_totals;
  const onDutyToday = log.recap?.on_duty_today ?? totals.driving + totals.on_duty;
  const cycleUsedAtEnd = nonNegativeHours(log.recap?.cycle_used_at_end, log.cycle_used_hours);
  const remainingCycleHours = nonNegativeHours(
    log.recap?.remaining_cycle_hours,
    70 - cycleUsedAtEnd,
  );
  const seventyHourValues = {
    a: nonNegativeHours(log.recap?.seventy_hour_a, cycleUsedAtEnd),
    b: nonNegativeHours(log.recap?.seventy_hour_b, remainingCycleHours),
    c: nonNegativeHours(log.recap?.seventy_hour_c, cycleUsedAtEnd),
  };
  const recapIsEstimated = log.recap?.estimated !== false;
  const estimateBasis = log.recap?.estimate_basis?.trim() || (
    "Estimated from the provided starting 70-hour cycle total and generated trip duty "
    + "events; prior daily history was not supplied."
  );
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
  const remarks = visibleLogRemarks(log.remarks);
  return (
    <figure className="log-sheet" role="img" aria-labelledby={captionId}>
      <svg viewBox="0 0 513 518" aria-hidden="true" focusable="false">
        <desc>Vector daily log totaling {totalHours.toFixed(2)} hours.</desc>
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
          <clipPath id={`${clipId}-location-timeline`}><rect x="40" y="260" width="415" height="138" /></clipPath>
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
          <text data-paper-field="remarks-total" x="480" y="279.5" textAnchor="middle" fontSize="8.5" fontWeight="700">=24</text>

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
          <text
            data-paper-recap="estimate-label"
            x="206"
            y="438"
            textAnchor="middle"
            fontSize="4"
            fontWeight="700"
            fill="#475569"
          >
            {recapIsEstimated ? "Estimated from cycle total" : "Calculated recap"}
          </text>
          {seventyHourRecapFields.map(({ key, x }) => (
            <text
              data-paper-recap={`seventy-hour-${key}`}
              key={`seventy-hour-${key}`}
              x={x}
              y="451"
              textAnchor="middle"
              fontSize="7"
              fontWeight="700"
            >
              {seventyHourValues[key].toFixed(2)}
            </text>
          ))}
          {sixtyHourRecapFieldXs.map((x, index) => (
            <text
              data-paper-recap="sixty-hour-not-applicable"
              key={`sixty-hour-not-applicable-${index}`}
              x={x}
              y="451"
              textAnchor="middle"
              fontSize="6"
              fontWeight="700"
              fill="#475569"
            >
              N/A
            </text>
          ))}
        </g>
        <LogTrace segments={log.segments} />
        <LogLocationTimeline
          clipId={`${clipId}-location-timeline`}
          formatLocation={locationForPaperField}
          remarks={remarks}
          segments={log.segments}
        />
      </svg>
      <figcaption id={captionId} className="sr-only">
        Filled driver's daily log for {log.date}: {totals.driving} hours driving, {totals.on_duty} hours on duty,{" "}
        {totals.off_duty} hours off duty, and {totals.sleeper_berth} hours in the sleeper berth.{" "}
        70-hour recap {recapIsEstimated ? "estimates" : "values"}: A {seventyHourValues.a.toFixed(2)}, B{" "}
        {seventyHourValues.b.toFixed(2)}, and C {seventyHourValues.c.toFixed(2)} hours.{" "}
        {recapIsEstimated ? `Estimate basis: ${estimateBasis} ` : ""}
        The 60-hour/7-day recap fields are not applicable.
      </figcaption>
    </figure>
  );
});
