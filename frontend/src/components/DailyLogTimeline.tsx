import type { DailyLogRemark, DailyLogSegment, DutyStatus } from "../types";
import { LOG_GRAPH_LEFT, LOG_GRAPH_WIDTH, LOG_LANE_Y } from "./DailyLogTemplate";

const TRACE_BOUNDARY_EPSILON_MINUTES = 0.01;
const REMARK_MATCH_EPSILON_MINUTES = 0.75;
const REMARK_RULER_Y = 266;
const REMARK_BRACKET_TOP_Y = 272;
const REMARK_BRACKET_BOTTOM_Y = 282;
const REMARK_LABEL_Y = 293;
const REMARK_LABEL_LEFT = 45;
const REMARK_LABEL_RIGHT = 450;
const REMARK_LABEL_ROTATION = -50;
const MIN_DIRECT_LABEL_CLEARANCE = 17;
const DIRECT_LABEL_LIMIT = 8;
const DENSE_LEGEND_MAX_ROWS = 3;
const LEGACY_REMARK_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?:\s*([AP])\.?M\.?)?$/i;
const REMARK_RULER_TICKS = Array.from({ length: 97 }, (_, quarter) => ({
  isHalfHour: quarter % 2 === 0,
  isHour: quarter % 4 === 0,
  minute: quarter * 15,
}));

interface TimedBoundary {
  key: string;
  index: number;
  minute: number;
  time: string;
  status: DutyStatus;
  location: string;
  activity: string;
}

interface LocationAnnotation {
  key: string;
  boundaries: TimedBoundary[];
  startMinute: number;
  endMinute: number;
  location: string;
  status: DutyStatus;
  activity: string;
}

interface DirectLabel extends LocationAnnotation {
  anchorX: number;
  activityLabel: string;
  locationLabel: string;
  row: number;
  separatorLength: number;
  textAnchor: "start" | "end";
  rotation: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function xForLogMinute(minute: number) {
  return LOG_GRAPH_LEFT + (clamp(minute, 0, 1440) / 1440) * LOG_GRAPH_WIDTH;
}

function traceCoordinate(value: number) {
  return Number(value.toFixed(3));
}

function parseLegacyRemarkMinute(value: string) {
  const match = value.trim().match(LEGACY_REMARK_TIME_PATTERN);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (period === "P") hour += 12;
  } else if (hour === 24 && minute === 0) {
    return 1440;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function minuteForRemark(remark: DailyLogRemark) {
  if (typeof remark.minute === "number" && Number.isFinite(remark.minute)) {
    return clamp(remark.minute, 0, 1440);
  }
  return parseLegacyRemarkMinute(remark.time);
}

function shortenLocation(value: string, maximum = 28) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function activityForPaper(value: string) {
  return value
    .replace(/pre-trip inspection/gi, "Pre-trip")
    .replace(/meal\/dinner break/gi, "Dinner break")
    .replace(/meal\/rest break/gi, "Meal break")
    .replace(/continued sleeper berth/gi, "Sleeper continued");
}

function buildBoundaries(
  remarks: DailyLogRemark[],
  formatLocation: (location: string) => string,
) {
  return remarks.flatMap<TimedBoundary>((remark, index) => {
    const minute = minuteForRemark(remark);
    const location = formatLocation(remark.location).trim();
    if (minute === null || !location) return [];
    return [{
      key: remark.event_id?.trim() || `${minute}-${index}-${location}`,
      index,
      minute,
      time: remark.time,
      status: remark.status,
      location,
      activity: remark.activity?.trim() || remark.note.trim() || "Duty-status change",
    }];
  }).sort((left, right) => left.minute - right.minute || left.index - right.index);
}

function buildPeriodAnnotations(
  boundaries: TimedBoundary[],
  segments: DailyLogSegment[],
) {
  return boundaries.flatMap<LocationAnnotation>((boundary, index) => {
    if (boundary.status === "driving" || boundary.status === "sleeper_berth") return [];

    const matchingSegment = segments.find((segment) => (
      segment.status === boundary.status
      && Math.abs(segment.start_minute - boundary.minute) <= REMARK_MATCH_EPSILON_MINUTES
    ));
    const nextBoundary = boundaries[index + 1];
    const inferredEndMinute = matchingSegment?.end_minute
      ?? (nextBoundary && nextBoundary.minute > boundary.minute
        ? nextBoundary.minute
        : boundary.minute);
    const endMinute = clamp(inferredEndMinute, boundary.minute, 1440);
    if (endMinute - boundary.minute <= TRACE_BOUNDARY_EPSILON_MINUTES) return [];
    const endBoundary = boundaries.slice(index + 1).find((candidate) => (
      Math.abs(candidate.minute - endMinute) <= REMARK_MATCH_EPSILON_MINUTES
    ));

    return [{
      key: boundary.key,
      boundaries: endBoundary ? [boundary, endBoundary] : [boundary],
      startMinute: boundary.minute,
      endMinute,
      location: boundary.location,
      status: boundary.status,
      activity: boundary.activity,
    }];
  });
}

function buildDirectLabels(annotations: LocationAnnotation[]) {
  const labels: DirectLabel[] = [];
  const rotationRadians = Math.abs(REMARK_LABEL_ROTATION) * (Math.PI / 180);

  for (const annotation of annotations) {
    const locationLabel = shortenLocation(annotation.location, 27);
    const activityLabel = shortenLocation(activityForPaper(annotation.activity), 29);
    const centerX = xForLogMinute((annotation.startMinute + annotation.endMinute) / 2);
    const footprint = clamp(Math.max(locationLabel.length, activityLabel.length) * 3.1, 44, 92);
    const horizontalFootprint = footprint * Math.cos(rotationRadians);
    const separatorLength = clamp(
      Math.max(locationLabel.length, activityLabel.length) * 2.9,
      26,
      74,
    );
    const anchorX = clamp(centerX, REMARK_LABEL_LEFT + horizontalFootprint, REMARK_LABEL_RIGHT);
    const previousAnchorX = labels.at(-1)?.anchorX;
    if (
      previousAnchorX !== undefined
      && Math.abs(anchorX - previousAnchorX) * Math.sin(rotationRadians)
        < MIN_DIRECT_LABEL_CLEARANCE
    ) return null;
    labels.push({
      ...annotation,
      anchorX,
      activityLabel,
      locationLabel,
      row: 0,
      separatorLength,
      textAnchor: "end",
      rotation: REMARK_LABEL_ROTATION,
    });
  }
  return labels;
}

function buildTracePath(segments: DailyLogSegment[]) {
  if (segments.length === 0) return { definition: "", transitionCount: 0 };

  const first = segments[0];
  const commands = [
    `M ${traceCoordinate(xForLogMinute(first.start_minute))} ${LOG_LANE_Y[first.status]}`,
    `H ${traceCoordinate(xForLogMinute(first.end_minute))}`,
  ];
  let transitionCount = 0;

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const currentY = LOG_LANE_Y[current.status];
    const boundariesTouch = Math.abs(current.start_minute - previous.end_minute)
      <= TRACE_BOUNDARY_EPSILON_MINUTES;

    if (boundariesTouch) {
      if (current.status !== previous.status) {
        commands.push(`V ${currentY}`);
        transitionCount += 1;
      }
    } else {
      commands.push(`M ${traceCoordinate(xForLogMinute(current.start_minute))} ${currentY}`);
    }
    commands.push(`H ${traceCoordinate(xForLogMinute(current.end_minute))}`);
  }

  return { definition: commands.join(" "), transitionCount };
}

export function LogTrace({ segments }: { segments: DailyLogSegment[] }) {
  const trace = buildTracePath(segments);
  if (!trace.definition) return null;
  return (
    <path
      className="log-trace"
      data-trace-path
      data-segment-count={segments.length}
      data-transition-count={trace.transitionCount}
      d={trace.definition}
      fill="none"
      stroke="#173b5b"
      strokeWidth="2.25"
      strokeLinecap="butt"
      strokeLinejoin="round"
    />
  );
}

function RemarkRuler() {
  return (
    <g className="log-location-timeline__ruler" stroke="#334e68">
      <line x1={LOG_GRAPH_LEFT} y1={REMARK_RULER_Y} x2={LOG_GRAPH_LEFT + LOG_GRAPH_WIDTH} y2={REMARK_RULER_Y} strokeWidth="0.65" />
      {REMARK_RULER_TICKS.map(({ isHalfHour, isHour, minute }) => {
        const tickBottom = REMARK_RULER_Y + (isHour ? 9 : isHalfHour ? 6 : 3.5);
        const x = traceCoordinate(xForLogMinute(minute));
        return (
          <line
            data-remarks-ruler-tick
            key={minute}
            x1={x}
            y1={REMARK_RULER_Y}
            x2={x}
            y2={tickBottom}
            strokeWidth={isHour ? 0.65 : 0.45}
          />
        );
      })}
    </g>
  );
}

function BoundaryStems({ boundaries }: { boundaries: TimedBoundary[] }) {
  return (
    <g className="log-location-timeline__boundaries" stroke="#173b5b" strokeWidth="1.15">
      {boundaries.map((boundary) => {
        const x = traceCoordinate(xForLogMinute(boundary.minute));
        return (
          <line
            data-location-boundary
            data-location={boundary.location}
            data-minute={boundary.minute}
            data-status={boundary.status}
            key={boundary.key}
            x1={x}
            y1={REMARK_RULER_Y}
            x2={x}
            y2={REMARK_BRACKET_TOP_Y}
          />
        );
      })}
    </g>
  );
}

function PeriodBrackets({ annotations }: { annotations: LocationAnnotation[] }) {
  return (
    <g className="log-location-timeline__periods" fill="none" stroke="#173b5b" strokeWidth="1.15">
      {annotations.map((annotation) => {
        const startX = traceCoordinate(xForLogMinute(annotation.startMinute));
        const endX = traceCoordinate(xForLogMinute(annotation.endMinute));
        return (
          <path
            d={`M ${startX} ${REMARK_BRACKET_TOP_Y} V ${REMARK_BRACKET_BOTTOM_Y} H ${endX} V ${REMARK_BRACKET_TOP_Y}`}
            data-location-bracket
            data-activity={annotation.activity}
            data-end-minute={annotation.endMinute}
            data-start-minute={annotation.startMinute}
            key={annotation.key}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

function DirectLocationLabels({ labels }: { labels: DirectLabel[] }) {
  return (
    <g className="log-location-timeline__direct" fill="#06152d" fontFamily="Arial, Helvetica, sans-serif">
      {labels.map((annotation) => {
        const centerX = traceCoordinate(
          xForLogMinute((annotation.startMinute + annotation.endMinute) / 2),
        );
        const labelY = REMARK_LABEL_Y;
        const connectorY = labelY - 3;

        return (
          <g
            data-location-annotation
            data-boundary-count={annotation.boundaries.length}
            data-end-minute={annotation.endMinute}
            data-start-minute={annotation.startMinute}
            data-status={annotation.status}
            data-activity={annotation.activity}
            key={annotation.key}
          >
            <path
              data-location-connector
              d={`M ${centerX} ${REMARK_BRACKET_BOTTOM_Y} L ${traceCoordinate(annotation.anchorX)} ${connectorY}`}
              fill="none"
              stroke="#173b5b"
              strokeWidth="0.9"
            />
            <line
              data-location-separator
              x1={traceCoordinate(annotation.anchorX - annotation.separatorLength)}
              x2={traceCoordinate(annotation.anchorX)}
              y1={labelY + 3.25}
              y2={labelY + 3.25}
              stroke="#173b5b"
              strokeWidth="0.65"
              transform={`rotate(${annotation.rotation} ${traceCoordinate(annotation.anchorX)} ${labelY})`}
            />
            <text
              aria-label={`${annotation.locationLabel} / ${annotation.activityLabel}`}
              data-location-label
              data-label-row={annotation.row}
              x={traceCoordinate(annotation.anchorX)}
              y={labelY}
              fontSize="7.2"
              fontWeight="700"
              textAnchor={annotation.textAnchor}
              transform={`rotate(${annotation.rotation} ${traceCoordinate(annotation.anchorX)} ${labelY})`}
            >
              <tspan x={traceCoordinate(annotation.anchorX)}>{annotation.locationLabel}</tspan>
              <tspan x={traceCoordinate(annotation.anchorX)} dy="12">{annotation.activityLabel}</tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}

function DenseLocationLegend({ annotations }: { annotations: LocationAnnotation[] }) {
  const rows = Math.min(DENSE_LEGEND_MAX_ROWS, Math.max(1, annotations.length));
  const columns = Math.ceil(annotations.length / rows);
  const availableWidth = REMARK_LABEL_RIGHT - REMARK_LABEL_LEFT;
  const columnWidth = availableWidth / columns;
  const characterLimit = Math.max(12, Math.floor(columnWidth / 2.65));

  return (
    <g className="log-location-timeline__legend" fontFamily="Arial, Helvetica, sans-serif">
      {annotations.map((annotation, index) => {
        const column = Math.floor(index / rows);
        const row = index % rows;
        const markerX = traceCoordinate(xForLogMinute((annotation.startMinute + annotation.endMinute) / 2));
        const legendX = REMARK_LABEL_LEFT + column * columnWidth;
        const legendY = 291 + row * 12;
        const number = index + 1;
        const firstTime = annotation.boundaries[0]?.time ?? "";
        const lastTime = annotation.boundaries.at(-1)?.time ?? firstTime;
        const timeLabel = firstTime === lastTime ? firstTime : `${firstTime}–${lastTime}`;
        const legendLabel = shortenLocation(
          `${number} · ${timeLabel} · ${annotation.location} · ${activityForPaper(annotation.activity)}`,
          characterLimit,
        );

        return (
          <g data-location-legend-entry data-start-minute={annotation.startMinute} key={annotation.key}>
            <circle cx={markerX} cy="279" r="4" fill="#173b5b" stroke="#ffffff" strokeWidth="0.75" />
            <text x={markerX} y="280.6" fill="#ffffff" fontSize="3.6" fontWeight="700" textAnchor="middle">{number}</text>
            <text
              data-location-legend-label
              x={legendX}
              y={legendY}
              fill="#06152d"
              fontSize="5.2"
              fontWeight="700"
            >
              {legendLabel}
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface LogLocationTimelineProps {
  clipId: string;
  formatLocation: (location: string) => string;
  remarks: DailyLogRemark[];
  segments: DailyLogSegment[];
}

export function LogLocationTimeline({
  clipId,
  formatLocation,
  remarks,
  segments,
}: LogLocationTimelineProps) {
  const boundaries = buildBoundaries(remarks, formatLocation);
  if (boundaries.length === 0) return null;

  const annotations = buildPeriodAnnotations(boundaries, segments);
  if (annotations.length === 0) return null;
  const directLabels = annotations.length <= DIRECT_LABEL_LIMIT
    ? buildDirectLabels(annotations)
    : null;

  return (
    <g className="log-location-timeline" clipPath={`url(#${clipId})`}>
      <RemarkRuler />
      <BoundaryStems boundaries={boundaries} />
      <PeriodBrackets annotations={annotations} />
      {directLabels
        ? <DirectLocationLabels labels={directLabels} />
        : <DenseLocationLegend annotations={annotations} />}
    </g>
  );
}
