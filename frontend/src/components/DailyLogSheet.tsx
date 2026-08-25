import type { DailyLog, DutyStatus, TripMetadata } from "../types";
import { useId } from "react";

interface DailyLogSheetProps {
  log: DailyLog;
  metadata?: TripMetadata;
}

const laneY: Record<DutyStatus, number> = {
  off_duty: 190,
  sleeper_berth: 208,
  driving: 226,
  on_duty: 244,
};

const graphLeft = 66;
const graphWidth = 388;

function xForMinute(minute: number) {
  const normalized = Math.min(1440, Math.max(0, minute));
  return graphLeft + (normalized / 1440) * graphWidth;
}

function LogTrace({ log }: { log: DailyLog }) {
  return (
    <g className="log-trace" fill="none" stroke="#0b6fe8" strokeWidth="2.25" strokeLinejoin="round">
      {log.segments.map((segment, index) => {
        const next = log.segments[index + 1];
        const startX = xForMinute(segment.start_minute);
        const endX = xForMinute(segment.end_minute);
        const y = laneY[segment.status];
        return (
          <g key={`${segment.status}-${segment.start_minute}-${segment.end_minute}`}>
            <line x1={startX} y1={y} x2={endX} y2={y} />
            {next && next.start_minute === segment.end_minute ? (
              <line x1={endX} y1={y} x2={endX} y2={laneY[next.status]} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

export function DailyLogSheet({ log, metadata = {} }: DailyLogSheetProps) {
  const captionId = useId();
  const date = new Date(`${log.date}T12:00:00`);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  const totals = log.status_totals;
  const onDutyToday = log.recap?.on_duty_today ?? totals.driving + totals.on_duty;
  const cycleUsedAtEnd = log.recap?.cycle_used_at_end ?? log.cycle_used_hours;
  const remainingCycleHours = log.recap?.remaining_cycle_hours ?? Math.max(0, 70 - cycleUsedAtEnd);
  const overflowRemarkCount = Math.max(1, log.remarks.length - 4);
  const overflowRemarkSpacing = Math.min(9, 78 / overflowRemarkCount);
  const remarkFontSize = Math.min(7.25, Math.max(4.5, overflowRemarkSpacing * 0.8));

  return (
    <figure className="log-sheet" aria-labelledby={captionId}>
      <svg viewBox="0 0 513 518" role="img" aria-label={`Filled driver's daily log for ${log.date}`}>
        <image href="/blank-paper-log.png" x="0" y="0" width="513" height="518" />
        <g className="log-overlay-text" fill="#06152d" fontFamily="Inter, Arial, sans-serif">
          <text x="191" y="20" textAnchor="middle" fontSize="8" fontWeight="700">{month}</text>
          <text x="235" y="20" textAnchor="middle" fontSize="8" fontWeight="700">{day}</text>
          <text x="279" y="20" textAnchor="middle" fontSize="8" fontWeight="700">{year}</text>

          <text x="168" y="47" textAnchor="middle" fontSize="8" fontWeight="500">{log.from_location}</text>
          <text x="357" y="47" textAnchor="middle" fontSize="8" fontWeight="500">{log.to_location}</text>

          <text x="94" y="79" textAnchor="middle" fontSize="10" fontWeight="700">{Math.round(log.total_miles)}</text>
          <text x="181" y="79" textAnchor="middle" fontSize="10" fontWeight="700">{Math.round(log.total_miles)}</text>
          <text x="138" y="115" textAnchor="middle" fontSize="7" fontWeight="600">{metadata.vehicle_number ?? ""}</text>

          <text x="347" y="80" textAnchor="middle" fontSize="7" fontWeight="600">{metadata.carrier_name ?? ""}</text>
          <text x="62" y="143" fontSize="6.25" fontWeight="600">{metadata.driver_name ? `Driver: ${metadata.driver_name}` : ""}</text>

          <text x="478" y="187" textAnchor="middle" fontSize="8" fontWeight="700">{totals.off_duty.toFixed(2)}</text>
          <text x="478" y="205" textAnchor="middle" fontSize="8" fontWeight="700">{totals.sleeper_berth.toFixed(2)}</text>
          <text x="478" y="223" textAnchor="middle" fontSize="8" fontWeight="700">{totals.driving.toFixed(2)}</text>
          <text x="478" y="241" textAnchor="middle" fontSize="8" fontWeight="700">{totals.on_duty.toFixed(2)}</text>

          {log.remarks.map((remark, index) => (
            <text
              key={`${remark.time}-${remark.note}-${index}`}
              x={index < 4 ? 75 : 115}
              y={index < 4 ? 278 + index * 11 : 328 + (index - 4) * overflowRemarkSpacing}
              fontSize={remarkFontSize}
            >
              <tspan fontWeight="700">{remark.time}</tspan>
              <tspan dx="8">{remark.note}{remark.location ? ` — ${remark.location}` : ""}</tspan>
            </text>
          ))}
          <text x="60" y="345" textAnchor="middle" fontSize="7">{metadata.shipping_document_number ?? ""}</text>
          <text x="86" y="451" textAnchor="middle" fontSize="8" fontWeight="700">{onDutyToday.toFixed(2)}</text>
          <text x="162" y="451" textAnchor="middle" fontSize="8" fontWeight="700">{cycleUsedAtEnd.toFixed(2)}</text>
          <text x="213" y="451" textAnchor="middle" fontSize="8" fontWeight="700">{remainingCycleHours.toFixed(2)}</text>
        </g>
        <LogTrace log={log} />
      </svg>
      <figcaption id={captionId} className="sr-only">
        Driver log for {log.date}: {totals.driving} hours driving, {totals.on_duty} hours on duty,
        {totals.off_duty} hours off duty, and {totals.sleeper_berth} hours in the sleeper berth.
      </figcaption>
    </figure>
  );
}
