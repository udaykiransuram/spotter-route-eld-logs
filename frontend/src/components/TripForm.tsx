import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { Clock3 } from "lucide-react";
import { type FormEvent, memo, useCallback, useState } from "react";
import { localInputToIso } from "../lib/format";
import type { LocationValue, TripMetadata, TripPlanRequest } from "../types";
import { formFieldSx } from "./form-control-styles";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { TripLogSettings } from "./TripLogSettings";

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
  initialRequest?: TripPlanRequest;
  onFormChange: () => void;
  onPrepareResults?: () => void;
}

interface FieldErrors {
  current?: string;
  pickup?: string;
  dropoff?: string;
  cycle?: string;
}

const coordinatesMatch = (first: LocationValue, second: LocationValue) => (
  Math.round(first.lat * 1_000_000) === Math.round(second.lat * 1_000_000)
  && Math.round(first.lon * 1_000_000) === Math.round(second.lon * 1_000_000)
);

export const TripForm = memo(function TripForm({
  onGenerate,
  loading,
  apiError,
  initialRequest,
  onFormChange,
  onPrepareResults,
}: TripFormProps) {
  const [current, setCurrent] = useState<LocationValue | null>(
    initialRequest?.current_location ?? defaultLocations.current,
  );
  const [pickup, setPickup] = useState<LocationValue | null>(
    initialRequest?.pickup_location ?? defaultLocations.pickup,
  );
  const [dropoff, setDropoff] = useState<LocationValue | null>(
    initialRequest?.dropoff_location ?? defaultLocations.dropoff,
  );
  const [cycleUsed, setCycleUsed] = useState(
    String(initialRequest?.current_cycle_used_hours ?? 30),
  );
  const [departureAt, setDepartureAt] = useState(initialRequest?.departure_at ?? "");
  const [timezone, setTimezone] = useState(initialRequest?.home_terminal_timezone ?? "");
  const [metadata, setMetadata] = useState<TripMetadata>(initialRequest?.metadata ?? {});
  const [errors, setErrors] = useState<FieldErrors>({});

  const clearFieldError = useCallback((field: keyof FieldErrors) => {
    setErrors((previous) => previous[field]
      ? { ...previous, [field]: undefined }
      : previous);
  }, []);

  const updateMetadata = useCallback((key: keyof TripMetadata, value: string) => {
    setMetadata((previous) => ({ ...previous, [key]: value }));
    onFormChange();
  }, [onFormChange]);

  const updateCurrent = useCallback((value: LocationValue | null) => {
    setCurrent(value);
    clearFieldError("current");
    onFormChange();
  }, [clearFieldError, onFormChange]);

  const updatePickup = useCallback((value: LocationValue | null) => {
    setPickup(value);
    clearFieldError("pickup");
    onFormChange();
  }, [clearFieldError, onFormChange]);

  const updateDropoff = useCallback((value: LocationValue | null) => {
    setDropoff(value);
    clearFieldError("dropoff");
    onFormChange();
  }, [clearFieldError, onFormChange]);

  const updateDepartureAt = useCallback((value: string) => {
    setDepartureAt(value);
    onFormChange();
  }, [onFormChange]);

  const updateTimezone = useCallback((value: string) => {
    setTimezone(value);
    onFormChange();
  }, [onFormChange]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    onPrepareResults?.();

    const nextErrors: FieldErrors = {};
    if (!current) nextErrors.current = "Select a current location from the suggestions.";
    if (!pickup) nextErrors.pickup = "Select a pickup location from the suggestions.";
    if (!dropoff) nextErrors.dropoff = "Select a drop-off location from the suggestions.";
    if (current && pickup && coordinatesMatch(current, pickup)) {
      nextErrors.pickup = "Pickup location must differ from current location.";
    } else if (current && dropoff && coordinatesMatch(current, dropoff)) {
      nextErrors.dropoff = "Drop-off location must differ from current location.";
    } else if (pickup && dropoff && coordinatesMatch(pickup, dropoff)) {
      nextErrors.dropoff = "Drop-off location must differ from pickup location.";
    }
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
    <section className="planner-sidebar" aria-labelledby="trip-form-title">
      <div className="planner-sidebar__intro">
        <h1 id="trip-form-title">Enter trip details</h1>
        <p>Enter trip details to get a compliant route, recommended stops, and daily log sheets.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate aria-busy={loading}>
        <fieldset className="trip-form-fields" disabled={loading}>
        <LocationAutocomplete
          label="Current location"
          name="current_location"
          value={current}
          onChange={updateCurrent}
          error={errors.current}
        />
        <LocationAutocomplete
          label="Pickup location"
          name="pickup_location"
          value={pickup}
          onChange={updatePickup}
          error={errors.pickup}
        />
        <LocationAutocomplete
          label="Drop-off location"
          name="dropoff_location"
          value={dropoff}
          onChange={updateDropoff}
          error={errors.dropoff}
        />

        <TextField
          className={`field ${errors.cycle ? "field--error" : ""}`}
          error={Boolean(errors.cycle)}
          fullWidth
          helperText={errors.cycle ?? "Driving and on-duty hours already worked in the current 70-hour/8-day cycle."}
          id="cycle-used"
          label="Current cycle used (hours)"
          name="current_cycle_used_hours"
          onChange={(event) => {
            setCycleUsed(event.target.value);
            clearFieldError("cycle");
            onFormChange();
          }}
          size="small"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Clock3 size={17} aria-hidden="true" />
                </InputAdornment>
              ),
            },
            inputLabel: { shrink: true },
            htmlInput: {
              min: 0,
              max: 70,
              step: 0.25,
              inputMode: "decimal",
              "aria-describedby": "cycle-used-help",
            },
            formHelperText: {
              id: "cycle-used-help",
              role: errors.cycle ? "alert" : undefined,
            },
          }}
          sx={formFieldSx}
          type="number"
          value={cycleUsed}
        />

        <TripLogSettings
          departureAt={departureAt}
          metadata={metadata}
          onDepartureChange={updateDepartureAt}
          onMetadataChange={updateMetadata}
          onTimezoneChange={updateTimezone}
          timezone={timezone}
        />

        <Button
          className="primary-button planner-submit"
          disableElevation
          disabled={loading}
          fullWidth
          onFocus={onPrepareResults}
          onMouseEnter={onPrepareResults}
          startIcon={loading ? <CircularProgress aria-hidden="true" color="inherit" size={18} /> : undefined}
          sx={{
            minHeight: "42px",
            borderRadius: "var(--radius-control)",
            backgroundColor: "var(--teal-950)",
            fontFamily: "var(--font-ui)",
            fontSize: "14px",
            fontWeight: 700,
            textTransform: "none",
            "&:hover": { backgroundColor: "#00566a" },
          }}
          type="submit"
          variant="contained"
        >
          {loading ? "Generating route…" : "Generate route & logs"}
        </Button>
        </fieldset>
        {apiError ? (
          <Alert
            className="form-alert"
            severity="error"
            sx={{
              alignItems: "center",
              fontFamily: "var(--font-ui)",
              "& .MuiAlert-message": { padding: 0 },
            }}
            variant="outlined"
          >
            {apiError}
          </Alert>
        ) : null}
      </form>
    </section>
  );
});
