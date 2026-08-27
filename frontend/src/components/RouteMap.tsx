import maplibregl, {
  LngLatBounds,
  type Map as MapLibreMap,
  type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dutyStatusLabels, formatTime, stopTypeLabels } from "../lib/format";
import type { TripPlan } from "../types";
import { MapFallback } from "./MapFallback";
import {
  calculateMarkerDisplacements,
  createPersistentFailureTracker,
} from "./route-map-layout";
import { createStopTypeIconElement } from "./stop-type-icon";
import "./RouteMap.css";

interface RouteMapProps {
  plan: TripPlan;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
}

interface MarkerRecord {
  marker: Marker;
  root: HTMLDivElement;
  element: HTMLElement;
  stem: HTMLSpanElement;
  lon: number;
  lat: number;
  sequence: number;
  handleClick?: () => void;
}

type MapStatus =
  | { planId: string; state: "loading" }
  | { planId: string; state: "ready" }
  | { planId: string; state: "error"; message: string };

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const MAP_STYLE_TIMEOUT_MS = 15_000;
const POST_LOAD_RESOURCE_ERROR_LIMIT = 4;
const CURRENT_LOCATION_MARKER_ID = "__current-location";

function createMarkerShell(extraClassName?: string) {
  const root = document.createElement("div");
  root.className = `map-stop-marker${extraClassName ? ` ${extraClassName}` : ""}`;

  const anchor = document.createElement("span");
  anchor.className = "map-stop-marker__anchor";
  anchor.setAttribute("aria-hidden", "true");
  root.append(anchor);

  const stem = document.createElement("span");
  stem.className = "map-stop-marker__stem";
  stem.setAttribute("aria-hidden", "true");
  root.append(stem);

  return { root, stem };
}

function neutralizeMapLibreMarkerSemantics(root: HTMLDivElement) {
  root.setAttribute("role", "presentation");
  root.removeAttribute("aria-label");
  root.removeAttribute("tabindex");
}

function applyCalmMapPalette(map: MapLibreMap) {
  const setPaint = (layerId: string, property: string, value: string | number) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  };

  setPaint("background", "background-color", "#f8f7f3");
  setPaint("natural_earth", "raster-opacity", 0.08);
  setPaint("natural_earth", "raster-saturation", 0.2);
  setPaint("natural_earth", "raster-contrast", -0.08);
  setPaint("water", "fill-color", "#d9eaf4");
  setPaint("park", "fill-color", "#cfeacb");
  setPaint("park", "fill-opacity", 0.82);
  setPaint("park", "fill-outline-color", "#a9d0a5");
  setPaint("park_outline", "line-color", "#a9d0a5");
  setPaint("landcover_wood", "fill-color", "#c9e5c4");
  setPaint("landcover_wood", "fill-opacity", 0.68);
  setPaint("landcover_grass", "fill-color", "#dcefc5");
  setPaint("landcover_grass", "fill-opacity", 0.58);
  setPaint("landuse_residential", "fill-color", "#f0efec");

  for (const layer of map.getStyle().layers) {
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
    if (layer.type === "line" && sourceLayer === "waterway") {
      map.setPaintProperty(layer.id, "line-color", "#b5d2e2");
    }
    if (layer.type === "line" && sourceLayer === "transportation") {
      const color = layer.id.includes("rail")
        ? "#c5cdd2"
        : layer.id.includes("casing")
          ? "#d3d9dd"
          : "#ffffff";
      map.setPaintProperty(layer.id, "line-color", color);
      if (layer.id.includes("rail")) map.setPaintProperty(layer.id, "line-opacity", 0.58);
    }
    if (layer.type === "symbol" && sourceLayer === "place") {
      map.setPaintProperty(layer.id, "text-color", "#1c3550");
      map.setPaintProperty(layer.id, "text-halo-color", "#fffefa");
      map.setPaintProperty(layer.id, "text-halo-width", 1.2);
    }
    if (layer.type === "symbol" && sourceLayer === "transportation_name") {
      map.setPaintProperty(layer.id, "text-color", "#526a7d");
      map.setPaintProperty(layer.id, "text-halo-color", "#fffefa");
    }
  }
}

function webGlIsAvailable() {
  return typeof WebGLRenderingContext !== "undefined"
    || typeof WebGL2RenderingContext !== "undefined";
}

function updateMarkerLayout(map: MapLibreMap, markers: Map<string, MarkerRecord>) {
  const points = Array.from(markers, ([id, record]) => {
    const projected = map.project([record.lon, record.lat]);
    return { id, sequence: record.sequence, x: projected.x, y: projected.y };
  });
  const displacements = calculateMarkerDisplacements(points);

  for (const [id, record] of markers) {
    const displacement = displacements.get(id) ?? { x: 0, y: 0 };
    const distance = Math.hypot(displacement.x, displacement.y);
    const isDisplaced = distance > 1;

    record.element.style.left = `${displacement.x}px`;
    record.element.style.top = `${displacement.y}px`;
    record.stem.style.width = `${distance}px`;
    record.stem.style.transform = `rotate(${Math.atan2(displacement.y, displacement.x)}rad)`;
    record.root.classList.toggle("map-stop-marker--displaced", isDisplaced);
  }
}

export default function RouteMap({ plan, selectedStopId, onSelectStop }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeBoundsRef = useRef<LngLatBounds | null>(null);
  const markersRef = useRef(new Map<string, MarkerRecord>());
  const selectRef = useRef(onSelectStop);
  const layoutFrameRef = useRef<number | null>(null);
  const [storedMapStatus, setMapStatus] = useState<MapStatus>({ planId: plan.id, state: "loading" });
  const mapStatus: MapStatus = storedMapStatus.planId === plan.id
    ? storedMapStatus
    : { planId: plan.id, state: "loading" };

  useEffect(() => {
    selectRef.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    const container = containerRef.current;
    let map: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let styleTimeout: number | null = null;
    let mounted = true;
    let destroyed = false;
    let styleReady = false;
    const postLoadFailures = createPersistentFailureTracker(POST_LOAD_RESOURCE_ERROR_LIMIT);

    const markers = markersRef.current;
    const cancelScheduledLayout = () => {
      if (layoutFrameRef.current === null) return;
      window.cancelAnimationFrame(layoutFrameRef.current);
      layoutFrameRef.current = null;
    };
    const scheduleMarkerLayout = () => {
      if (!map || destroyed || layoutFrameRef.current !== null) return;
      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        if (map && !destroyed) updateMarkerLayout(map, markers);
      });
    };
    const teardown = () => {
      if (destroyed) return;
      destroyed = true;
      cancelScheduledLayout();
      if (styleTimeout !== null) window.clearTimeout(styleTimeout);
      resizeObserver?.disconnect();
      for (const record of markers.values()) {
        if (record.handleClick) {
          record.element.removeEventListener("click", record.handleClick);
        }
        record.marker.remove();
      }
      markers.clear();
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
    const showMapError = (message: string) => {
      if (!mounted || destroyed) return;
      setMapStatus({ planId: plan.id, state: "error", message });
      teardown();
    };

    if (!container) return teardown;
    if (!webGlIsAvailable()) {
      showMapError("This browser cannot display the interactive map because WebGL is unavailable.");
      return () => {
        mounted = false;
        teardown();
      };
    }

    const routeCoordinates = plan.route.geometry.coordinates;
    if (routeCoordinates.length === 0) {
      showMapError("The route service did not return map geometry for this trip.");
      return () => {
        mounted = false;
        teardown();
      };
    }

    const requestStart = plan.request?.current_location;
    const dutyEventStart = plan.duty_events[0]?.start_coordinates;
    const [currentLon, currentLat] = requestStart
      ? [requestStart.lon, requestStart.lat]
      : dutyEventStart ?? routeCoordinates[0];
    const currentLabel = requestStart?.label
      ?? plan.duty_events[0]?.start_location
      ?? "Current location";

    const bounds = new LngLatBounds(routeCoordinates[0], routeCoordinates[0]);
    for (const coordinate of routeCoordinates) bounds.extend(coordinate);
    bounds.extend([currentLon, currentLat]);
    routeBoundsRef.current = bounds;

    try {
      const mapPadding = container.clientWidth < 640 ? 36 : 56;
      map = new maplibregl.Map({
        container,
        style: MAP_STYLE,
        bounds,
        fitBoundsOptions: { padding: mapPadding, maxZoom: 12 },
        attributionControl: false,
        cooperativeGestures: true,
      });
      mapRef.current = map;
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();

      resizeObserver = new ResizeObserver(() => {
        map?.resize();
        scheduleMarkerLayout();
      });
      resizeObserver.observe(container);
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      map.on("move", scheduleMarkerLayout);
      map.on("zoom", scheduleMarkerLayout);
      map.on("idle", () => postLoadFailures.reset());
      map.on("error", (event) => {
        if (!styleReady) {
          const detail = event.error?.message ? ` ${event.error.message}` : "";
          showMapError(`The road map style could not be loaded.${detail}`);
        } else if (postLoadFailures.recordFailure()) {
          showMapError("The road map could not keep its basemap resources loaded.");
        }
      });
      map.on("load", () => {
        if (!map || destroyed) return;
        try {
          applyCalmMapPalette(map);
          const firstSymbolLayerId = map.getStyle().layers
            .find((layer) => layer.type === "symbol")?.id;
          map.addSource("trip-route", { type: "geojson", data: plan.route });
          map.addLayer({
            id: "trip-route-shadow",
            type: "line",
            source: "trip-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.94 },
          }, firstSymbolLayerId);
          map.addLayer({
            id: "trip-route-line",
            type: "line",
            source: "trip-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#173b5b", "line-width": 5 },
          }, firstSymbolLayerId);
          styleReady = true;
          if (styleTimeout !== null) window.clearTimeout(styleTimeout);
          setMapStatus({ planId: plan.id, state: "ready" });
          scheduleMarkerLayout();
        } catch {
          showMapError("The route line could not be initialized on the road map.");
        }
      });

      const currentShell = createMarkerShell("map-stop-marker--current");
      const currentElement = document.createElement("div");
      currentElement.className = "map-marker map-marker--current";
      currentElement.setAttribute("aria-label", `Current location, ${currentLabel}`);
      currentElement.setAttribute("role", "img");
      currentElement.setAttribute("title", `Current location: ${currentLabel}`);
      currentElement.append(createStopTypeIconElement("start", "map-marker__icon"));
      currentShell.root.append(currentElement);

      const currentMarker = new maplibregl.Marker({ element: currentShell.root, anchor: "center" })
        .setLngLat([currentLon, currentLat])
        .addTo(map);
      neutralizeMapLibreMarkerSemantics(currentShell.root);
      markers.set(CURRENT_LOCATION_MARKER_ID, {
        marker: currentMarker,
        root: currentShell.root,
        element: currentElement,
        stem: currentShell.stem,
        lon: currentLon,
        lat: currentLat,
        sequence: 0,
      });

      for (const stop of plan.stops) {
        const { root, stem } = createMarkerShell();

        const element = document.createElement("button");
        element.className = `map-marker map-marker--${stop.type}`;
        element.type = "button";
        element.append(createStopTypeIconElement(stop.type, "map-marker__icon"));
        const sequence = document.createElement("span");
        sequence.className = "map-marker__sequence";
        sequence.textContent = String(stop.sequence);
        element.append(sequence);
        const timezone = plan.daily_logs[0]?.timezone;
        element.setAttribute(
          "aria-label",
          `${stop.sequence}. ${stopTypeLabels[stop.type]}, ${stop.label}, ${formatTime(stop.scheduled_at, timezone)}, ${stop.type === "rest" ? "Off Duty meal and Sleeper Berth" : dutyStatusLabels[stop.duty_status]}`,
        );
        element.setAttribute("aria-pressed", "false");
        const handleClick = () => selectRef.current(stop.id);
        element.addEventListener("click", handleClick);
        root.append(element);

        const marker = new maplibregl.Marker({ element: root, anchor: "center" })
          .setLngLat([stop.lon, stop.lat])
          .addTo(map);
        neutralizeMapLibreMarkerSemantics(root);
        markers.set(stop.id, {
          marker,
          root,
          element,
          stem,
          lon: stop.lon,
          lat: stop.lat,
          sequence: stop.sequence,
          handleClick,
        });
      }

      styleTimeout = window.setTimeout(() => {
        showMapError("The road map took too long to initialize.");
      }, MAP_STYLE_TIMEOUT_MS);
    } catch {
      showMapError("The interactive route map could not be initialized in this browser.");
    }

    return () => {
      mounted = false;
      routeBoundsRef.current = null;
      teardown();
    };
  }, [plan]);

  useEffect(() => {
    for (const [id, { element, handleClick }] of markersRef.current) {
      if (!handleClick) continue;
      const selected = id === selectedStopId;
      element.classList.toggle("map-marker--selected", selected);
      element.setAttribute("aria-pressed", String(selected));
    }
    const selected = selectedStopId
      ? plan.stops.find((stop) => stop.id === selectedStopId)
      : undefined;
    if (selected && mapRef.current) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      mapRef.current.easeTo({
        center: [selected.lon, selected.lat],
        zoom: Math.max(mapRef.current.getZoom(), 6),
        duration: reduceMotion ? 0 : 420,
      });
    }
  }, [plan.stops, selectedStopId]);

  const fitFullRoute = () => {
    const map = mapRef.current;
    const bounds = routeBoundsRef.current;
    const container = containerRef.current;
    if (!map || !bounds || !container) return;
    map.fitBounds(bounds, {
      padding: container.clientWidth < 640 ? 36 : 56,
      maxZoom: 12,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
    });
  };

  const changeZoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const targetZoom = Math.max(
      map.getMinZoom(),
      Math.min(map.getMaxZoom(), map.getZoom() + delta),
    );
    map.easeTo({
      zoom: targetZoom,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240,
    });
  };

  const fallback = mapStatus.state === "error"
    ? <MapFallback error={mapStatus.message} />
    : <MapFallback />;
  const routeStart = plan.request?.current_location.label ?? plan.duty_events[0]?.start_location ?? "the current location";
  const routePickup = plan.request?.pickup_location.label;
  const routeEnd = plan.request?.dropoff_location.label ?? plan.duty_events.at(-1)?.end_location ?? "the drop-off";

  return (
    <div className="route-map-shell" data-map-status={mapStatus.state}>
      <p className="sr-only" id={`route-map-description-${plan.id}`}>
        {Math.round(plan.summary.distance_miles).toLocaleString()}-mile truck route from {routeStart}
        {routePickup ? ` through ${routePickup}` : ""} to {routeEnd} with {plan.stops.length} scheduled stops.
      </p>
      <div
        ref={containerRef}
        className="route-map"
        aria-label="Truck route map with scheduled stops"
        aria-describedby={`route-map-description-${plan.id}`}
        aria-hidden={mapStatus.state === "error"}
      />
      {mapStatus.state === "ready" ? (
        <div className="route-map__controls" role="group" aria-label="Map controls">
          <button className="route-map__control" type="button" onClick={() => changeZoom(1)} aria-label="Zoom in" title="Zoom in">
            <Plus size={18} aria-hidden="true" />
          </button>
          <button className="route-map__control" type="button" onClick={() => changeZoom(-1)} aria-label="Zoom out" title="Zoom out">
            <Minus size={18} aria-hidden="true" />
          </button>
          <button className="route-map__control" type="button" onClick={fitFullRoute} aria-label="Fit full route" title="Fit full route">
            <Maximize2 size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {mapStatus.state !== "ready" ? <div className="route-map__fallback">{fallback}</div> : null}
      <noscript>The route map requires JavaScript. All stops are also listed in the route plan.</noscript>
    </div>
  );
}
