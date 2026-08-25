import { lazy, Suspense, useState } from "react";
import { ApiError, generateTripPlan } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { AssumptionsPanel } from "../components/AssumptionsPanel";
import { DirectionsPanel } from "../components/DirectionsPanel";
import { ItineraryPanel } from "../components/ItineraryPanel";
import { MapFallback } from "../components/MapFallback";
import { RouteSummary } from "../components/RouteSummary";
import { TripForm } from "../components/TripForm";
import { usePlan } from "../state/plan-store";
import type { TripPlanRequest } from "../types";

const RouteMap = lazy(() => import("../components/RouteMap"));

export function RoutePage() {
  const { plan, savePlan } = usePlan();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const handleGenerate = async (request: TripPlanRequest) => {
    setLoading(true);
    setError("");
    try {
      const generated = await generateTripPlan(request);
      savePlan(generated);
      setSelectedStopId(null);
      window.setTimeout(() => {
        document.getElementById("route-results")?.focus({ preventScroll: false });
      }, 0);
    } catch (requestError) {
      const message = requestError instanceof ApiError
        ? requestError.message
        : "The route service could not be reached. Check your connection and try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <main className={`route-workspace ${plan ? "route-workspace--results" : "route-workspace--empty"}`}>
        <div className="route-workspace__left">
          <TripForm onGenerate={handleGenerate} loading={loading} apiError={error} />
          {plan ? <AssumptionsPanel assumptions={plan.assumptions} warnings={plan.warnings} /> : null}
        </div>

        {plan ? (
          <>
            <section className="route-results" id="route-results" tabIndex={-1} aria-label="Generated route results">
              <RouteSummary summary={plan.summary} />
              <Suspense fallback={<MapFallback />}>
                <RouteMap plan={plan} selectedStopId={selectedStopId} onSelectStop={setSelectedStopId} />
              </Suspense>
              <DirectionsPanel instructions={plan.instructions} />
            </section>
            <ItineraryPanel plan={plan} selectedStopId={selectedStopId} onSelectStop={setSelectedStopId} />
          </>
        ) : (
          <section className="empty-results" aria-labelledby="empty-results-title">
            <div className="empty-results__map"><MapFallback loading={false} /></div>
            <div className="empty-results__copy">
              <h2 id="empty-results-title">Your route, stops, and logs in one view</h2>
              <p>Confirm the trip details, then generate a route that accounts for driving limits, breaks, fuel, pickup, and drop-off time.</p>
              <ol>
                <li><span>1</span>Select all three locations.</li>
                <li><span>2</span>Enter hours already used in your 70-hour cycle.</li>
                <li><span>3</span>Generate the route and review each daily log.</li>
              </ol>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
