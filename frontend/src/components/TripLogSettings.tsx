import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { ChevronDown, MapPin } from "lucide-react";
import { memo } from "react";
import type { TripMetadata } from "../types";
import { formFieldSx } from "./form-control-styles";

interface TripLogSettingsProps {
  departureAt: string;
  timezone: string;
  metadata: TripMetadata;
  onDepartureChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onMetadataChange: (key: keyof TripMetadata, value: string) => void;
}

interface MetadataFieldDefinition {
  key: keyof TripMetadata;
  id: string;
  label: string;
  maxLength: number;
  wide?: boolean;
  helperText?: string;
}

const metadataFields: readonly MetadataFieldDefinition[] = [
  { key: "driver_name", id: "driver-name", label: "Driver", maxLength: 120 },
  { key: "carrier_name", id: "carrier-name", label: "Carrier", maxLength: 160 },
  {
    key: "main_office_address",
    id: "main-office-address",
    label: "Main office address",
    maxLength: 200,
    wide: true,
  },
  {
    key: "home_terminal_address",
    id: "home-terminal-address",
    label: "Home terminal address",
    maxLength: 200,
    wide: true,
  },
  {
    key: "vehicle_number",
    id: "vehicle-number",
    label: "Vehicle identifiers",
    maxLength: 80,
    helperText: "Truck, tractor, trailer, or plate number(s).",
  },
  {
    key: "shipping_document_number",
    id: "shipping-document",
    label: "Shipping details",
    maxLength: 100,
    helperText: "Document number, shipper, or commodity.",
  },
] as const;

const settingsPanelSx = {
  borderTop: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  borderRadius: 0,
  backgroundColor: "transparent",
  boxShadow: "none",
  "&::before": { display: "none" },
  "&.Mui-expanded": { margin: 0 },
} as const;

export const TripLogSettings = memo(function TripLogSettings({
  departureAt,
  timezone,
  metadata,
  onDepartureChange,
  onTimezoneChange,
  onMetadataChange,
}: TripLogSettingsProps) {
  return (
    <Accordion
      className="settings-panel"
      disableGutters
      elevation={0}
      slotProps={{ transition: { unmountOnExit: true } }}
      slots={{ heading: "h2" }}
      sx={settingsPanelSx}
    >
      <AccordionSummary
        aria-controls="paper-log-details"
        expandIcon={<ChevronDown size={18} aria-hidden="true" />}
        id="paper-log-details-heading"
        sx={{
          minHeight: "50px",
          padding: 0,
          "&.Mui-expanded": { minHeight: "50px" },
          "& .MuiAccordionSummary-content": {
            margin: 0,
            color: "var(--ink)",
            fontFamily: "var(--font-ui)",
            fontSize: "12.5px",
            fontWeight: 700,
          },
          "& .MuiAccordionSummary-content.Mui-expanded": { margin: 0 },
        }}
      >
        <span>Trip &amp; log settings</span>
      </AccordionSummary>
      <AccordionDetails
        className="settings-panel__content"
        id="paper-log-details"
        sx={{ display: "grid", gap: "14px", padding: "0 0 16px" }}
      >
        <p className="field-help">
          Leave plan start blank to begin at the current time. The pre-trip starts then when cycle
          time is available; otherwise the required restart begins first. Leave timezone blank to
          detect it from Current location. The remaining details fill the paper logs.
        </p>
        <TextField
          className="field"
          helperText="The schedule begins at this time; a required cycle restart may come before the pre-trip."
          id="departure-at"
          label="Plan start"
          name="departure_at"
          onChange={(event) => onDepartureChange(event.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { "aria-describedby": "departure-at-help" },
            formHelperText: { id: "departure-at-help" },
          }}
          sx={formFieldSx}
          type="datetime-local"
          value={departureAt}
        />
        <TextField
          className="field"
          helperText="Uses Current location above—not your device GPS. This timezone controls duty start and all daily-log times."
          id="home-timezone"
          label="Home-terminal timezone"
          name="home_terminal_timezone"
          onChange={(event) => onTimezoneChange(event.target.value)}
          placeholder="Optional override, e.g. America/Chicago"
          slotProps={{
            inputLabel: { shrink: true },
            input: {
              endAdornment: timezone.trim() ? undefined : (
                <InputAdornment position="end">
                  <span className="timezone-auto-indicator">
                    <MapPin size={13} aria-hidden="true" />
                    Auto
                  </span>
                </InputAdornment>
              ),
            },
            htmlInput: { maxLength: 80, "aria-describedby": "home-timezone-help" },
            formHelperText: { id: "home-timezone-help" },
          }}
          sx={formFieldSx}
          value={timezone}
        />
        <div className="settings-grid">
          {metadataFields.map((field) => {
            const helperId = field.helperText ? `${field.id}-help` : undefined;
            return (
              <TextField
                className={`field${field.wide ? " settings-grid__wide" : ""}`}
                helperText={field.helperText}
                id={field.id}
                key={field.key}
                label={field.label}
                onChange={(event) => onMetadataChange(field.key, event.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    maxLength: field.maxLength,
                    "aria-describedby": helperId,
                  },
                  formHelperText: helperId ? { id: helperId } : undefined,
                }}
                sx={formFieldSx}
                value={metadata[field.key] ?? ""}
              />
            );
          })}
        </div>
      </AccordionDetails>
    </Accordion>
  );
});
