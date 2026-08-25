import maplibregl, { LngLatBounds, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { TripPlan } from "../types";

interface RouteMapProps {
  plan: TripPlan;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function RouteMap({ plan, selectedStopId, onSelectStop }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const selectRef = useRef(onSelectStop);

  useEffect(() => {
    selectRef.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof WebGLRenderingContext === "undefined") return;

    const routeCoordinates = plan.route.geometry.coordinates;
    if (routeCoordinates.length === 0) return;
    const bounds = new LngLatBounds(routeCoordinates[0], routeCoordinates[0]);
    for (const coordinate of routeCoordinates) bounds.extend(coordinate);

    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 58 },
      attributionControl: false,
    });
    const markers = markersRef.current;
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      map.addSource("trip-route", { type: "geojson", data: plan.route });
      map.addLayer({
        id: "trip-route-shadow",
        type: "line",
        source: "trip-route",
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.92 },
      });
      map.addLayer({
        id: "trip-route-line",
        type: "line",
        source: "trip-route",
        paint: { "line-color": "#087a82", "line-width": 4.5 },
      });
    });

    for (const stop of plan.stops) {
      const element = document.createElement("button");
      element.className = `map-marker map-marker--${stop.type}`;
      element.type = "button";
      element.textContent = String(stop.sequence);
      element.setAttribute("aria-label", `${stop.sequence}. ${stop.label}: ${stop.reason}`);
      element.addEventListener("click", () => selectRef.current(stop.id));
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([stop.lon, stop.lat])
        .addTo(map);
      markers.set(stop.id, { marker, element });
    }

    return () => {
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [plan]);

  useEffect(() => {
    for (const [id, { element }] of markersRef.current) {
      element.classList.toggle("map-marker--selected", id === selectedStopId);
    }
    const selected = selectedStopId ? plan.stops.find((stop) => stop.id === selectedStopId) : undefined;
    if (selected && mapRef.current) {
      mapRef.current.easeTo({ center: [selected.lon, selected.lat], zoom: Math.max(mapRef.current.getZoom(), 6), duration: 500 });
    }
  }, [plan.stops, selectedStopId]);

  return (
    <div className="route-map-shell">
      <div ref={containerRef} className="route-map" aria-label="Truck route map with scheduled stops" />
      <noscript>The route map requires JavaScript. All stops are also listed in the route plan.</noscript>
    </div>
  );
}
