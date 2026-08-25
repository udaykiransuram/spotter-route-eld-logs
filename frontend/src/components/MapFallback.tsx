import { LoaderCircle, Map } from "lucide-react";
import "./RouteMap.css";

interface MapFallbackProps {
  loading?: boolean;
  error?: string;
}

export function MapFallback({ loading = true, error }: MapFallbackProps) {
  const isLoading = loading && !error;
  const state = error ? "error" : isLoading ? "loading" : "empty";

  return (
    <div
      aria-label={state === "empty" ? "Generated route preview" : undefined}
      className={`map-fallback map-fallback--${state}`}
      role={error ? "alert" : isLoading ? "status" : "group"}
    >
      {isLoading ? (
        <LoaderCircle className="spin" size={26} aria-hidden="true" />
      ) : error ? (
        <Map size={28} aria-hidden="true" />
      ) : null}
      {error ? (
        <span className="map-fallback__copy">
          <strong>Route map unavailable</strong>
          <span>{error}</span>
          <small>The ordered itinerary, stop details, and daily logs are still available.</small>
        </span>
      ) : isLoading ? (
        <span>Loading route map…</span>
      ) : (
        <>
          <span className="map-fallback__motif" aria-hidden="true">
            <span className="map-fallback__route-line map-fallback__route-line--primary" />
            <span className="map-fallback__route-line map-fallback__route-line--secondary" />
            <span className="map-fallback__route-point map-fallback__route-point--start" />
            <span className="map-fallback__route-point map-fallback__route-point--end" />
            <span className="map-fallback__icon">
              <Map size={28} />
            </span>
          </span>
          <span className="map-fallback__copy map-fallback__copy--empty">
            <strong>Your generated route will appear here.</strong>
            <span>
              After you generate, this area will show your route, recommended stops, and daily log summaries.
            </span>
          </span>
        </>
      )}
    </div>
  );
}
