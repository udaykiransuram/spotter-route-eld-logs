import {
  CalendarClock,
  Clock3,
  FileText,
  Flag,
  Globe2,
  MapPin,
  Navigation,
  Route,
  Signpost,
} from "lucide-react";
import type { TripFormDraft } from "./TripForm";

interface TripPlanPreviewProps {
  draft?: TripFormDraft | null;
}

interface TripRouteArtworkProps extends TripPlanPreviewProps {
  standalone?: boolean;
}

const scheduleFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const hoursFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const paperLogFields = [
  { key: "driver_name", label: "Driver" },
  { key: "carrier_name", label: "Carrier" },
  { key: "main_office_address", label: "Main office" },
  { key: "home_terminal_address", label: "Home terminal" },
  { key: "vehicle_number", label: "Vehicle" },
  { key: "shipping_document_number", label: "Shipping" },
] as const satisfies ReadonlyArray<{
  key: keyof TripFormDraft["metadata"];
  label: string;
}>;

function displayValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function remainingCycleHours(value: string | undefined) {
  if (!value?.trim()) return null;
  const usedHours = Number(value);
  if (!Number.isFinite(usedHours) || usedHours < 0 || usedHours > 70) return null;
  return 70 - usedHours;
}

function cycleFallback(value: string | undefined) {
  return value?.trim() ? "Enter 0–70 used hours" : "Enter used cycle hours";
}

function formatSchedule(value: string | undefined) {
  if (!value?.trim()) return "Starts when generated";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value.replace("T", " at ");
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ));
  return Number.isNaN(date.getTime()) ? value.replace("T", " at ") : scheduleFormatter.format(date);
}

export function TripRouteArtwork({ draft, standalone = false }: TripRouteArtworkProps) {
  const currentLabel = draft?.current?.label.trim() || "Select current location";
  const pickupLabel = draft?.pickup?.label.trim() || "Select pickup location";
  const dropoffLabel = draft?.dropoff?.label.trim() || "Select drop-off location";

  return (
    <div
      aria-label={standalone ? "Live route preview" : undefined}
      className={`trip-preview__route-stage${standalone ? " landing-route-artwork" : ""}`}
      role={standalone ? "group" : undefined}
    >
      <svg
        aria-hidden="true"
        className="trip-preview__route-line"
        focusable="false"
        height="144"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 640 144"
        width="640"
      >
        <path
          className="trip-preview__route-line-shadow"
          d="M64 82 C144 32 205 37 270 81 S417 134 576 62"
          pathLength="1"
        />
        <path
          className="trip-preview__route-line-path"
          d="M64 82 C144 32 205 37 270 81 S417 134 576 62"
          pathLength="1"
        />
      </svg>

      <ol aria-label="Planned route locations" className="trip-preview__stops">
        <li className="trip-preview__stop trip-preview__stop--current">
          <span className="trip-preview__marker" aria-hidden="true">
            <Navigation size={17} />
          </span>
          <span className="trip-preview__stop-copy">
            <strong>{currentLabel}</strong>
            <span>Current location</span>
          </span>
        </li>
        <li className="trip-preview__stop trip-preview__stop--pickup">
          <span className="trip-preview__marker" aria-hidden="true">
            <MapPin size={18} />
          </span>
          <span className="trip-preview__stop-copy">
            <strong>{pickupLabel}</strong>
            <span>Pickup</span>
          </span>
        </li>
        <li className="trip-preview__stop trip-preview__stop--dropoff">
          <span className="trip-preview__marker" aria-hidden="true">
            <Flag size={17} />
          </span>
          <span className="trip-preview__stop-copy">
            <strong>{dropoffLabel}</strong>
            <span>Drop-off</span>
          </span>
        </li>
      </ol>
    </div>
  );
}

export function TripPlanPreview({ draft }: TripPlanPreviewProps) {
  const timezoneLabel = displayValue(
    draft?.timezone,
    draft?.current ? "Auto-detect from current location" : "Select current location to detect",
  );
  const remainingHours = remainingCycleHours(draft?.cycleUsedHours);
  const remainingHoursLabel = remainingHours === null
    ? cycleFallback(draft?.cycleUsedHours)
    : `Estimated ${hoursFormatter.format(remainingHours)}h remaining`;
  const completedPaperFields = paperLogFields.reduce(
    (count, field) => count + (draft?.metadata[field.key]?.trim() ? 1 : 0),
    0,
  );

  return (
    <section aria-label="Trip plan preview" className="trip-preview" role="group">
      <div className="trip-preview__route-canvas">
        <div className="trip-preview__route-heading">
          <span className="trip-preview__eyebrow">
            <Route aria-hidden="true" size={16} />
            Live route preview
          </span>
          <span className="trip-preview__route-note">Updates as you enter trip details</span>
        </div>

        <TripRouteArtwork draft={draft} />
      </div>

      <aside aria-labelledby="trip-preview-details" className="trip-preview__outcomes">
        <div className="trip-preview__outcomes-heading">
          <span className="trip-preview__outcomes-icon" aria-hidden="true">
            <Signpost size={18} />
          </span>
          <h2 id="trip-preview-details">Trip details</h2>
        </div>

        <dl className="trip-preview__outcome-list">
          <div className="trip-preview__outcome">
            <span className="trip-preview__outcome-icon" aria-hidden="true">
              <Clock3 size={18} />
            </span>
            <div className="trip-preview__outcome-copy">
              <dt><strong>70-hour cycle</strong></dt>
              <dd><span>{remainingHoursLabel}</span></dd>
            </div>
          </div>
          <div className="trip-preview__outcome">
            <span className="trip-preview__outcome-icon" aria-hidden="true">
              <CalendarClock size={18} />
            </span>
            <div className="trip-preview__outcome-copy">
              <dt><strong>Schedule</strong></dt>
              <dd><span>{formatSchedule(draft?.departureAt)}</span></dd>
            </div>
          </div>
          <div className="trip-preview__outcome">
            <span className="trip-preview__outcome-icon" aria-hidden="true">
              <Globe2 size={18} />
            </span>
            <div className="trip-preview__outcome-copy">
              <dt><strong>Log timezone</strong></dt>
              <dd><span>{timezoneLabel}</span></dd>
            </div>
          </div>
        </dl>

        <section aria-labelledby="trip-preview-paper-details" className="trip-preview__paper-details">
          <div className="trip-preview__paper-heading">
            <FileText aria-hidden="true" size={17} />
            <h3 id="trip-preview-paper-details">Paper log details</h3>
            <span>{completedPaperFields}/6 added</span>
          </div>

          <dl className="trip-preview__paper-grid">
            {paperLogFields.map(({ key, label }) => (
              <div className="trip-preview__paper-field" key={key}>
                <dt>{label}</dt>
                <dd>{displayValue(draft?.metadata[key], "Not added")}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>
    </section>
  );
}
