export type DutyStatus = "off_duty" | "sleeper_berth" | "driving" | "on_duty";

export type StopType =
  | "pickup"
  | "dropoff"
  | "fuel"
  | "break"
  | "meal_break"
  | "rest"
  | "cycle_restart"
  | "pretrip_inspection";

export interface LocationValue {
  id?: string;
  label: string;
  city?: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
}

export interface TripMetadata {
  driver_name?: string;
  carrier_name?: string;
  main_office_address?: string;
  home_terminal_address?: string;
  vehicle_number?: string;
  shipping_document_number?: string;
}

export interface TripPlanRequest {
  current_location: LocationValue;
  pickup_location: LocationValue;
  dropoff_location: LocationValue;
  current_cycle_used_hours: number;
  departure_at?: string;
  home_terminal_timezone?: string;
  metadata?: TripMetadata;
}

export interface RouteFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: {
    distance_miles: number;
    duration_hours: number;
  };
}

export interface RouteInstruction {
  id: string;
  leg_index: number;
  sequence: number;
  instruction: string;
  distance_miles: number;
  duration_minutes: number;
  start_mile: number;
  end_mile: number;
}

export interface TripSummary {
  distance_miles: number;
  driving_hours: number;
  total_elapsed_hours: number;
  trip_days: number;
  stop_count: number;
  departure_at: string;
  arrival_at: string;
  home_terminal_timezone: string;
}

export interface ScheduledStop {
  id: string;
  sequence: number;
  type: StopType;
  label: string;
  lat: number;
  lon: number;
  scheduled_at: string;
  end_at?: string;
  duration_minutes: number;
  duty_status: DutyStatus;
  reason: string;
  route_mile: number;
}

export type DutyEventType =
  | "driving"
  | "pretrip_inspection"
  | "pickup"
  | "dropoff"
  | "fuel"
  | "break"
  | "meal_break"
  | "rest"
  | "cycle_restart";

export interface DutyEvent {
  id: string;
  status: DutyStatus;
  event_type: DutyEventType;
  start_at: string;
  end_at: string;
  duration_hours?: number;
  start_location: string;
  end_location: string;
  start_coordinates: [number, number];
  end_coordinates: [number, number];
  start_mile: number;
  end_mile: number;
  miles_driven: number;
  note: string;
}

export interface DailyLogSegment {
  status: DutyStatus;
  start_minute: number;
  end_minute: number;
}

export interface DailyLogRemark {
  event_id?: string;
  time: string;
  minute?: number;
  timezone_abbreviation?: string;
  status: DutyStatus;
  location: string;
  activity?: string;
  note: string;
}

export interface DailyStatusTotals {
  off_duty: number;
  sleeper_berth: number;
  driving: number;
  on_duty: number;
}

export interface DailyLog {
  date: string;
  timezone: string;
  grid_note?: string | null;
  from_location: string;
  to_location: string;
  total_miles: number;
  status_totals: DailyStatusTotals;
  cycle_used_hours: number;
  recap?: {
    on_duty_today: number;
    cycle_used_at_start: number;
    cycle_used_at_end: number;
    remaining_cycle_hours: number;
    restart_completed: boolean;
    seventy_hour_a?: number;
    seventy_hour_b?: number;
    seventy_hour_c?: number;
    estimated?: boolean;
    estimate_basis?: string;
  };
  segments: DailyLogSegment[];
  remarks: DailyLogRemark[];
}

export interface TripPlan {
  id: string;
  created_at: string;
  route: RouteFeature;
  instructions: RouteInstruction[];
  summary: TripSummary;
  stops: ScheduledStop[];
  duty_events: DutyEvent[];
  daily_logs: DailyLog[];
  metadata: TripMetadata;
  assumptions: string[];
  warnings: string[];
  notice: string;
  attribution: {
    routing: string;
    map: string;
  };
  request?: TripPlanRequest;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field: string | null;
    retryable: boolean;
  };
}

export interface StoredPlan {
  version: 1;
  plan: TripPlan;
}
