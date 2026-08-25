import { LoaderCircle, Map } from "lucide-react";
import "./RouteMap.css";

interface MapFallbackProps {
  loading?: boolean;
  error?: string;
}

export function MapFallback({ loading = true, error }: MapFallbackProps) {
  const isLoading = loading && !error;

  return (
    <div className="map-fallback" role={error ? "alert" : "status"}>
      {isLoading ? <LoaderCircle className="spin" size={26} aria-hidden="true" /> : <Map size={28} aria-hidden="true" />}
      {error ? (
        <span className="map-fallback__copy">
          <strong>Route map unavailable</strong>
          <span>{error}</span>
          <small>The ordered itinerary, stop details, and daily logs are still available.</small>
        </span>
      ) : (
        <span>{isLoading ? "Loading route map…" : "Your generated route will appear here."}</span>
      )}
    </div>
  );
}
