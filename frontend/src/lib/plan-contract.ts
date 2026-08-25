import type {
  DailyLog,
  DutyEvent,
  DutyStatus,
  LocationValue,
  RouteInstruction,
  ScheduledStop,
  TripMetadata,
  TripPlan,
  TripPlanRequest,
} from "../types";

type UnknownRecord = Record<string, unknown>;

const dutyStatuses = new Set<DutyStatus>([
  "off_duty",
  "sleeper_berth",
  "driving",
  "on_duty",
]);
const stopTypes = new Set(["pickup", "dropoff", "fuel", "break", "rest", "cycle_restart"]);
const eventTypes = new Set(["driving", ...stopTypes]);
const metadataKeys: readonly (keyof TripMetadata)[] = [
  "driver_name",
  "carrier_name",
  "main_office_address",
  "home_terminal_address",
  "vehicle_number",
  "shipping_document_number",
];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isDutyStatus(value: unknown): value is DutyStatus {
  return typeof value === "string" && dutyStatuses.has(value as DutyStatus);
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1]);
}

export function isLocationValue(value: unknown): value is LocationValue {
  return isRecord(value)
    && isString(value.label)
    && isFiniteNumber(value.lat)
    && value.lat >= -90
    && value.lat <= 90
    && isFiniteNumber(value.lon)
    && value.lon >= -180
    && value.lon <= 180;
}

function isMetadata(value: unknown): value is TripMetadata {
  return isRecord(value)
    && metadataKeys.every((key) => value[key] === undefined || isString(value[key]));
}

function isRequest(value: unknown): value is TripPlanRequest {
  return isRecord(value)
    && isLocationValue(value.current_location)
    && isLocationValue(value.pickup_location)
    && isLocationValue(value.dropoff_location)
    && isFiniteNumber(value.current_cycle_used_hours)
    && value.current_cycle_used_hours >= 0
    && value.current_cycle_used_hours <= 70
    && (value.departure_at === undefined || isString(value.departure_at))
    && (value.home_terminal_timezone === undefined || isString(value.home_terminal_timezone))
    && (value.metadata === undefined || isMetadata(value.metadata));
}

function isInstruction(value: unknown): value is RouteInstruction {
  return isRecord(value)
    && isString(value.id)
    && isFiniteNumber(value.leg_index)
    && isFiniteNumber(value.sequence)
    && isString(value.instruction)
    && isFiniteNumber(value.distance_miles)
    && isFiniteNumber(value.duration_minutes)
    && isFiniteNumber(value.start_mile)
    && isFiniteNumber(value.end_mile);
}

function isStop(value: unknown): value is ScheduledStop {
  return isRecord(value)
    && isString(value.id)
    && isFiniteNumber(value.sequence)
    && typeof value.type === "string"
    && stopTypes.has(value.type)
    && isString(value.label)
    && isFiniteNumber(value.lat)
    && isFiniteNumber(value.lon)
    && isString(value.scheduled_at)
    && (value.end_at === undefined || isString(value.end_at))
    && isFiniteNumber(value.duration_minutes)
    && isDutyStatus(value.duty_status)
    && isString(value.reason)
    && isFiniteNumber(value.route_mile);
}

function isDutyEvent(value: unknown): value is DutyEvent {
  return isRecord(value)
    && isString(value.id)
    && isDutyStatus(value.status)
    && typeof value.event_type === "string"
    && eventTypes.has(value.event_type)
    && isString(value.start_at)
    && isString(value.end_at)
    && (value.duration_hours === undefined || isFiniteNumber(value.duration_hours))
    && isString(value.start_location)
    && isString(value.end_location)
    && isCoordinate(value.start_coordinates)
    && isCoordinate(value.end_coordinates)
    && isFiniteNumber(value.start_mile)
    && isFiniteNumber(value.end_mile)
    && isFiniteNumber(value.miles_driven)
    && isString(value.note);
}

function isDailyLog(value: unknown): value is DailyLog {
  if (!isRecord(value) || !isRecord(value.status_totals)) return false;
  const totals = value.status_totals;
  const totalHours = [...dutyStatuses].reduce(
    (total, status) => total + (isFiniteNumber(totals[status]) ? totals[status] : 0),
    0,
  );
  const segments = Array.isArray(value.segments) ? value.segments : [];
  const segmentsValid = segments.length > 0
    && segments.every((segment, index) => (
      isRecord(segment)
      && isDutyStatus(segment.status)
      && isFiniteNumber(segment.start_minute)
      && isFiniteNumber(segment.end_minute)
      && segment.start_minute >= 0
      && segment.end_minute <= 1440
      && segment.start_minute < segment.end_minute
      && (index === 0 || (
        isRecord(segments[index - 1])
        && segments[index - 1].end_minute === segment.start_minute
      ))
    ))
    && isRecord(segments[0])
    && segments[0].start_minute === 0
    && isRecord(segments.at(-1))
    && segments.at(-1)?.end_minute === 1440;
  const recapValid = value.recap === undefined || (
    isRecord(value.recap)
    && isFiniteNumber(value.recap.on_duty_today)
    && isFiniteNumber(value.recap.cycle_used_at_start)
    && isFiniteNumber(value.recap.cycle_used_at_end)
    && isFiniteNumber(value.recap.remaining_cycle_hours)
    && typeof value.recap.restart_completed === "boolean"
  );
  return isString(value.date)
    && isString(value.timezone)
    && (value.grid_note === undefined || value.grid_note === null || isString(value.grid_note))
    && isString(value.from_location)
    && isString(value.to_location)
    && isFiniteNumber(value.total_miles)
    && value.total_miles >= 0
    && isFiniteNumber(value.cycle_used_hours)
    && value.cycle_used_hours >= 0
    && value.cycle_used_hours <= 70
    && [...dutyStatuses].every((status) => isFiniteNumber(totals[status]))
    && Math.abs(totalHours - 24) < 0.011
    && segmentsValid
    && recapValid
    && Array.isArray(value.remarks)
    && value.remarks.every((remark) => (
      isRecord(remark)
      && isString(remark.time)
      && (remark.minute === undefined || isFiniteNumber(remark.minute))
      && (remark.event_id === undefined || isString(remark.event_id))
      && (remark.timezone_abbreviation === undefined || isString(remark.timezone_abbreviation))
      && isDutyStatus(remark.status)
      && isString(remark.location)
      && isString(remark.note)
    ));
}

export function isTripPlan(value: unknown): value is TripPlan {
  if (!isRecord(value) || !isRecord(value.route) || !isRecord(value.route.geometry)) {
    return false;
  }
  if (
    !isRecord(value.route.properties)
    || !isRecord(value.summary)
    || !isRecord(value.attribution)
  ) return false;

  const summary = value.summary;
  const routeProperties = value.route.properties;
  return isString(value.id)
    && isString(value.created_at)
    && value.route.type === "Feature"
    && value.route.geometry.type === "LineString"
    && Array.isArray(value.route.geometry.coordinates)
    && value.route.geometry.coordinates.length >= 2
    && value.route.geometry.coordinates.every(isCoordinate)
    && isFiniteNumber(routeProperties.distance_miles)
    && isFiniteNumber(routeProperties.duration_hours)
    && isFiniteNumber(summary.distance_miles)
    && isFiniteNumber(summary.driving_hours)
    && isFiniteNumber(summary.total_elapsed_hours)
    && isFiniteNumber(summary.trip_days)
    && isFiniteNumber(summary.stop_count)
    && isString(summary.departure_at)
    && isString(summary.arrival_at)
    && isString(summary.home_terminal_timezone)
    && Array.isArray(value.instructions)
    && value.instructions.every(isInstruction)
    && Array.isArray(value.stops)
    && value.stops.every(isStop)
    && Array.isArray(value.duty_events)
    && value.duty_events.length > 0
    && value.duty_events.every(isDutyEvent)
    && Array.isArray(value.daily_logs)
    && value.daily_logs.length > 0
    && value.daily_logs.every(isDailyLog)
    && isMetadata(value.metadata)
    && Array.isArray(value.assumptions)
    && value.assumptions.every(isString)
    && Array.isArray(value.warnings)
    && value.warnings.every(isString)
    && isString(value.notice)
    && isString(value.attribution.routing)
    && isString(value.attribution.map)
    && (value.request === undefined || isRequest(value.request));
}
