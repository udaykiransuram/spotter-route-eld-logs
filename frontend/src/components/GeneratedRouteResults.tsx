import { lazy, Suspense, useEffect } from "react";
import type { TripPlan } from "../types";
import { DirectionsPanel } from "./DirectionsPanel";
import { ItineraryPanel } from "./ItineraryPanel";
import { MapFallback } from "./MapFallback";
import { RouteSummary } from "./RouteSummary";
import { RouteGenerationUpdate } from "./RouteGenerationLoading";

const RouteMap = lazy(() => import("./RouteMap"));

interface GeneratedRouteResultsProps {
  plan: TripPlan;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onReady: (planId: string) => void;
  updating?: boolean;
}

export function GeneratedRouteResults({
  plan,
  selectedStopId,
  onSelectStop,
  onReady,
  updating = false,
}: GeneratedRouteResultsProps) {
  useEffect(() => onReady(plan.id), [onReady, plan.id]);

  return (
    <>
      <section
        className="route-results"
        id="route-results"
        tabIndex={-1}
        aria-label="Generated route results"
      >
        {updating ? <RouteGenerationUpdate /> : null}
        <RouteSummary summary={plan.summary} />
        <Suspense fallback={<MapFallback />}>
          <RouteMap
            plan={plan}
            selectedStopId={selectedStopId}
            onSelectStop={onSelectStop}
          />
        </Suspense>
        <DirectionsPanel instructions={plan.instructions} />
      </section>
      <ItineraryPanel
        plan={plan}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
      />
    </>
  );
}
