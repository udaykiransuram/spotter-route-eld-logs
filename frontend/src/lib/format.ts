import type { DutyStatus, StopType } from "../types";

const milesFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const localDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  key: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  const existing = cache.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat(locale, options);
  cache.set(key, formatter);
  return formatter;
}

export const dutyStatusLabels: Record<DutyStatus, string> = {
  off_duty: "Off Duty",
  sleeper_berth: "Sleeper Berth",
  driving: "Driving",
  on_duty: "On Duty",
};

export const stopTypeLabels: Record<StopType, string> = {
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel stop",
  break: "30 min break",
  rest: "10h rest",
  cycle_restart: "34h cycle restart",
};

export function formatMiles(value: number) {
  return `${milesFormatter.format(value)} mi`;
}

export function formatHours(value: number) {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatDuration(minutes: number) {
  if (minutes <= 0) return "—";
  return formatHours(minutes / 60);
}

export function formatTime(iso: string, timezone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return cachedFormatter(timeFormatters, timezone ?? "local", "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

export function formatDayLabel(dateString: string, dayNumber?: number) {
  const date = new Date(`${dateString}T12:00:00`);
  const label = dayFormatter.format(date);
  return dayNumber ? `${label} · Day ${dayNumber}` : label;
}

export function toLocalDateTimeValue(date = new Date(), timezone = "America/New_York") {
  const parts = cachedFormatter(localDateTimeFormatters, timezone, "en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function localInputToIso(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : undefined;
}
