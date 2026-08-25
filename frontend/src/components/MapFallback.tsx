import { LoaderCircle, Map } from "lucide-react";

interface MapFallbackProps {
  loading?: boolean;
}

export function MapFallback({ loading = true }: MapFallbackProps) {
  return (
    <div className="map-fallback" role="status">
      {loading ? <LoaderCircle className="spin" size={26} aria-hidden="true" /> : <Map size={28} aria-hidden="true" />}
      <span>{loading ? "Loading route map…" : "Your generated route will appear here."}</span>
    </div>
  );
}
