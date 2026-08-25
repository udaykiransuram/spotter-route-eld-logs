import { ChevronDown, Clock3, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { localInputToIso } from "../lib/format";
import type { LocationValue, TripMetadata, TripPlanRequest } from "../types";
import { LocationAutocomplete } from "./LocationAutocomplete";

const defaultLocations = {
  current: {
    id: "demo-richmond-va",
    label: "Richmond, VA",
    city: "Richmond",
    state: "VA",
    country: "United States",
    lat: 37.5407,
    lon: -77.436,
  },
  pickup: {
    id: "demo-nashville-tn",
    label: "Nashville, TN",
    city: "Nashville",
    state: "TN",
    country: "United States",
    lat: 36.1627,
    lon: -86.7816,
  },
  dropoff: {
    id: "demo-dallas-tx",
    label: "Dallas, TX",
    city: "Dallas",
    state: "TX",
    country: "United States",
    lat: 32.7767,
    lon: -96.797,
  },
} satisfies Record<string, LocationValue>;

interface TripFormProps {
  onGenerate: (request: TripPlanRequest) => Promise<void>;
  loading: boolean;
  apiError?: string;
}

interface FieldErrors {
  current?: string;
  pickup?: string;
  dropoff?: string;
  cycle?: string;
}

export function TripForm({ onGenerate, loading, apiError }: TripFormProps) {
  const [current, setCurrent] = useState<LocationValue | null>(defaultLocations.current);
  const [pickup, setPickup] = useState<LocationValue | null>(defaultLocations.pickup);
  const [dropoff, setDropoff] = useState<LocationValue | null>(defaultLocations.dropoff);
  const [cycleUsed, setCycleUsed] = useState("30");
  const [departureAt, setDepartureAt] = useState("");
  const [timezone, setTimezone] = useState("");
  const [metadata, setMetadata] = useState<TripMetadata>({});
  const [errors, setErrors] = useState<FieldErrors>({});

  const updateMetadata = (key: keyof TripMetadata, value: string) => {
    setMetadata((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const nextErrors: FieldErrors = {};
    if (!current) nextErrors.current = "Select a current location from the suggestions.";
    if (!pickup) nextErrors.pickup = "Select a pickup location from the suggestions.";
    if (!dropoff) nextErrors.dropoff = "Select a drop-off location from the suggestions.";
    const cycle = Number(cycleUsed);
    if (cycleUsed.trim() === "" || !Number.isFinite(cycle) || cycle < 0 || cycle > 70) {
      nextErrors.cycle = "Enter a number from 0 to 70 hours.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !current || !pickup || !dropoff) return;

    const cleanMetadata = Object.fromEntries(
      Object.entries(metadata)
        .map(([key, value]) => [key, value?.trim()] as const)
        .filter(([, value]) => value),
    ) as TripMetadata;

    await onGenerate({
      current_location: current,
      pickup_location: pickup,
      dropoff_location: dropoff,
      current_cycle_used_hours: cycle,
      departure_at: localInputToIso(departureAt),
      home_terminal_timezone: timezone.trim() || undefined,
      metadata: Object.keys(cleanMetadata).length > 0 ? cleanMetadata : undefined,
    });
  };

  return (
    <aside className="planner-sidebar" aria-labelledby="trip-form-title">
      <div className="planner-sidebar__intro">
        <h1 id="trip-form-title">Enter trip details</h1>
        <p>Enter trip details to get a compliant route, recommended stops, and daily log sheets.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate aria-busy={loading}>
        <LocationAutocomplete
          label="Current location"
          name="current_location"
          value={current}
          onChange={(value) => {
            setCurrent(value);
            setErrors((previous) => ({ ...previous, current: undefined }));
          }}
          error={errors.current}
        />
        <LocationAutocomplete
          label="Pickup location"
          name="pickup_location"
          value={pickup}
          onChange={(value) => {
            setPickup(value);
            setErrors((previous) => ({ ...previous, pickup: undefined }));
          }}
          error={errors.pickup}
        />
        <LocationAutocomplete
          label="Drop-off location"
          name="dropoff_location"
          value={dropoff}
          onChange={(value) => {
            setDropoff(value);
            setErrors((previous) => ({ ...previous, dropoff: undefined }));
          }}
          error={errors.dropoff}
        />

        <div className={`field ${errors.cycle ? "field--error" : ""}`}>
          <label htmlFor="cycle-used">Current cycle used (hours)</label>
          <div className="input-with-icon">
            <Clock3 className="field-icon" size={17} aria-hidden="true" />
            <input
              id="cycle-used"
              name="current_cycle_used_hours"
              type="number"
              min="0"
              max="70"
              step="0.25"
              inputMode="decimal"
              value={cycleUsed}
              aria-invalid={Boolean(errors.cycle)}
              aria-describedby={errors.cycle ? "cycle-used-error" : undefined}
              onChange={(event) => {
                setCycleUsed(event.target.value);
                setErrors((previous) => ({ ...previous, cycle: undefined }));
              }}
            />
          </div>
          {errors.cycle ? <p className="field-error" id="cycle-used-error" role="alert">{errors.cycle}</p> : null}
        </div>

        <details className="settings-panel">
          <summary>
            <span>Trip & log settings</span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div className="settings-panel__content">
            <div className="field">
              <label htmlFor="departure-at">Departure</label>
              <input
                id="departure-at"
                name="departure_at"
                type="datetime-local"
                value={departureAt}
                aria-describedby="departure-at-help"
                onChange={(event) => setDepartureAt(event.target.value)}
              />
              <p className="field-help" id="departure-at-help">Leave blank to start at the current time.</p>
            </div>
            <div className="field">
              <label htmlFor="home-timezone">Home-terminal timezone</label>
              <input
                id="home-timezone"
                name="home_terminal_timezone"
                value={timezone}
                maxLength={80}
                placeholder="Auto-detect from current location"
                aria-describedby="home-timezone-help"
                onChange={(event) => setTimezone(event.target.value)}
              />
              <p className="field-help" id="home-timezone-help">Leave blank to use the current location's timezone.</p>
            </div>
            <div className="settings-grid">
              <div className="field"><label htmlFor="driver-name">Driver</label><input id="driver-name" maxLength={120} value={metadata.driver_name ?? ""} onChange={(event) => updateMetadata("driver_name", event.target.value)} /></div>
              <div className="field"><label htmlFor="carrier-name">Carrier</label><input id="carrier-name" maxLength={160} value={metadata.carrier_name ?? ""} onChange={(event) => updateMetadata("carrier_name", event.target.value)} /></div>
              <div className="field settings-grid__wide"><label htmlFor="main-office-address">Main office address</label><input id="main-office-address" maxLength={200} value={metadata.main_office_address ?? ""} onChange={(event) => updateMetadata("main_office_address", event.target.value)} /></div>
              <div className="field settings-grid__wide"><label htmlFor="home-terminal-address">Home terminal address</label><input id="home-terminal-address" maxLength={200} value={metadata.home_terminal_address ?? ""} onChange={(event) => updateMetadata("home_terminal_address", event.target.value)} /></div>
              <div className="field"><label htmlFor="vehicle-number">Vehicle number</label><input id="vehicle-number" maxLength={80} value={metadata.vehicle_number ?? ""} onChange={(event) => updateMetadata("vehicle_number", event.target.value)} /></div>
              <div className="field"><label htmlFor="shipping-document">Shipping document</label><input id="shipping-document" maxLength={100} value={metadata.shipping_document_number ?? ""} onChange={(event) => updateMetadata("shipping_document_number", event.target.value)} /></div>
            </div>
          </div>
        </details>

        <button className="primary-button planner-submit" type="submit" disabled={loading}>
          {loading ? <><LoaderCircle className="spin" size={18} /> Generating route…</> : "Generate route & logs"}
        </button>
        {apiError ? <div className="form-alert" role="alert">{apiError}</div> : null}
      </form>
    </aside>
  );
}
