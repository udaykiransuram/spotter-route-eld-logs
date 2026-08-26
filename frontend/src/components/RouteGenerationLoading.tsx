import { FileText, Fuel, MapPin, Navigation, Route, TimerReset } from "lucide-react";
import type { TripPlanRequest } from "../types";

interface RouteGenerationLoadingProps {
  request: TripPlanRequest;
}

function locationName(label: string) {
  return label.split(",").slice(0, 2).join(",").trim();
}

export function RouteGenerationLoading({ request }: RouteGenerationLoadingProps) {
  const locations = [
    { label: "Current", name: locationName(request.current_location.label), icon: Navigation },
    { label: "Pickup", name: locationName(request.pickup_location.label), icon: MapPin },
    { label: "Drop-off", name: locationName(request.dropoff_location.label), icon: MapPin },
  ];

  return (
    <section
      aria-atomic="true"
      aria-live="polite"
      className="route-generation-loading"
      role="status"
    >
      <div className="route-generation-loading__inner">
        <div aria-hidden="true" className="route-generation-loading__route">
          <svg
            className="route-generation-loading__route-line"
            focusable="false"
            preserveAspectRatio="none"
            viewBox="0 0 640 180"
          >
            <path
              className="route-generation-loading__route-shadow"
              d="M56 118 C154 40 229 43 314 99 S472 148 584 58"
              pathLength="1"
            />
            <path
              className="route-generation-loading__route-path"
              d="M56 118 C154 40 229 43 314 99 S472 148 584 58"
              pathLength="1"
            />
          </svg>

          <ol className="route-generation-loading__stops">
            {locations.map(({ label, name, icon: Icon }, index) => (
              <li
                className={`route-generation-loading__stop route-generation-loading__stop--${index + 1}`}
                key={label}
              >
                <span className="route-generation-loading__marker">
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span className="route-generation-loading__location">
                  <strong>{label}</strong>
                  <small>{name}</small>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="route-generation-loading__copy">
          <h2>Building your route &amp; logs</h2>
          <p>
            Calculating the heavy-truck route, scheduling hours-of-service stops,
            and preparing daily log sheets.
          </p>
        </div>

        <ul aria-hidden="true" className="route-generation-loading__outputs">
          <li>
            <span><Route size={18} /></span>
            <strong>Truck route</strong>
          </li>
          <li>
            <span><Fuel size={18} /></span>
            <strong>Break &amp; fuel schedule</strong>
          </li>
          <li>
            <span><FileText size={18} /></span>
            <strong>Daily log sheets</strong>
          </li>
        </ul>

        <p className="route-generation-loading__hint">
          <TimerReset aria-hidden="true" size={15} />
          This can take up to a minute.
        </p>
      </div>
    </section>
  );
}

export function RouteGenerationUpdate() {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="route-generation-update"
      role="status"
    >
      <span aria-hidden="true" className="route-generation-update__icon">
        <span className="route-generation-update__pulse" />
        <Route size={19} />
      </span>
      <span className="route-generation-update__copy">
        <strong>Updating route &amp; logs…</strong>
        <small>Your current result will remain visible until the new plan is ready.</small>
      </span>
    </div>
  );
}
