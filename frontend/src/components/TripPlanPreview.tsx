import { FileText, Flag, MapPin, Navigation, Route, Signpost } from "lucide-react";

export function TripPlanPreview() {
  return (
    <section aria-label="Trip plan preview" className="trip-preview" role="group">
      <div className="trip-preview__route-canvas">
        <div className="trip-preview__route-heading">
          <span className="trip-preview__eyebrow">
            <Route aria-hidden="true" size={16} />
            Route preview
          </span>
          <span className="trip-preview__route-note">Built from your trip details</span>
        </div>

        <div className="trip-preview__route-stage">
          <svg
            aria-hidden="true"
            className="trip-preview__route-line"
            focusable="false"
            preserveAspectRatio="none"
            viewBox="0 0 640 144"
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

          <ol aria-label="Example route stops" className="trip-preview__stops">
            <li className="trip-preview__stop trip-preview__stop--current">
              <span className="trip-preview__marker" aria-hidden="true">
                <Navigation size={17} />
              </span>
              <span className="trip-preview__stop-copy">
                <strong>Current location</strong>
                <span>Starting point</span>
              </span>
            </li>
            <li className="trip-preview__stop trip-preview__stop--pickup">
              <span className="trip-preview__marker" aria-hidden="true">
                <MapPin size={18} />
              </span>
              <span className="trip-preview__stop-copy">
                <strong>Pickup</strong>
                <span>First appointment</span>
              </span>
            </li>
            <li className="trip-preview__stop trip-preview__stop--dropoff">
              <span className="trip-preview__marker" aria-hidden="true">
                <Flag size={17} />
              </span>
              <span className="trip-preview__stop-copy">
                <strong>Drop-off</strong>
                <span>Final destination</span>
              </span>
            </li>
          </ol>
        </div>
      </div>

      <aside aria-labelledby="trip-preview-outcomes" className="trip-preview__outcomes">
        <div className="trip-preview__outcomes-heading">
          <span className="trip-preview__outcomes-icon" aria-hidden="true">
            <Signpost size={18} />
          </span>
          <h2 id="trip-preview-outcomes">What you&apos;ll get</h2>
        </div>

        <ul className="trip-preview__outcome-list">
          <li className="trip-preview__outcome">
            <span className="trip-preview__outcome-icon" aria-hidden="true">
              <Route size={18} />
            </span>
            <span className="trip-preview__outcome-copy">
              <strong>Truck route</strong>
              <span>Road-level path and trip totals</span>
            </span>
          </li>
          <li className="trip-preview__outcome">
            <span className="trip-preview__outcome-icon" aria-hidden="true">
              <MapPin size={18} />
            </span>
            <span className="trip-preview__outcome-copy">
              <strong>Required stops</strong>
              <span>Breaks, rest, fuel, pickup, and drop-off</span>
            </span>
          </li>
          <li className="trip-preview__outcome">
            <span className="trip-preview__outcome-icon" aria-hidden="true">
              <FileText size={18} />
            </span>
            <span className="trip-preview__outcome-copy">
              <strong>Daily logs</strong>
              <span>One log sheet for each trip day</span>
            </span>
          </li>
        </ul>
      </aside>
    </section>
  );
}
