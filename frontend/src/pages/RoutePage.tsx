import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, generateTripPlan, prepareApiConnection } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { RouteGenerationLoading } from "../components/RouteGenerationLoading";
import { TripForm, type TripFormDraft } from "../components/TripForm";
import { TripRouteArtwork } from "../components/TripPlanPreview";
import { usePlan } from "../state/plan-context";
import type { TripPlanRequest } from "../types";

const loadGeneratedRouteResults = () => import("../components/GeneratedRouteResults");
const GeneratedRouteResults = lazy(() => loadGeneratedRouteResults().then((module) => ({
  default: module.GeneratedRouteResults,
})));
const loadAssumptionsPanel = () => import("../components/AssumptionsPanel");
const AssumptionsPanel = lazy(() => loadAssumptionsPanel().then((module) => ({
  default: module.AssumptionsPanel,
})));
const TRIP_REQUEST_TIMEOUT_MS = 60_000;
const MAP_TILE_ORIGIN = "https://tiles.openfreemap.org";

function prepareRouteMap() {
  void loadGeneratedRouteResults();
  void loadAssumptionsPanel();
  void import("../components/RouteMap");
  if (document.querySelector(`link[rel="preconnect"][href="${MAP_TILE_ORIGIN}"]`)) return;
  const preconnect = document.createElement("link");
  preconnect.rel = "preconnect";
  preconnect.href = MAP_TILE_ORIGIN;
  preconnect.crossOrigin = "anonymous";
  document.head.append(preconnect);
}

export function RoutePage() {
  const { plan, savePlan, clearPlan } = usePlan();
  const [loading, setLoading] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<TripPlanRequest | null>(null);
  const [error, setError] = useState("");
  const [formDraft, setFormDraft] = useState<TripFormDraft | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const pendingFocusPlanIdRef = useRef<string | null>(null);

  useEffect(() => {
    prepareApiConnection();
    return () => activeRequestRef.current?.abort();
  }, []);

  const handlePrepareResults = useCallback(() => {
    prepareRouteMap();
  }, []);

  const handleFormChange = useCallback(() => {
    pendingFocusPlanIdRef.current = null;
    setError("");
    setSelectedStopId(null);
    if (plan) clearPlan();
  }, [clearPlan, plan]);

  const handleGenerate = useCallback(async (request: TripPlanRequest) => {
    prepareRouteMap();
    const controller = new AbortController();
    activeRequestRef.current?.abort();
    activeRequestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TRIP_REQUEST_TIMEOUT_MS);
    setLoading(true);
    setPendingRequest(request);
    setError("");
    try {
      const generated = await generateTripPlan(request, controller.signal);
      pendingFocusPlanIdRef.current = generated.id;
      savePlan(generated);
      setSelectedStopId(null);
    } catch (requestError) {
      const message = controller.signal.aborted
        ? "The route request took too long. Please try again."
        : requestError instanceof ApiError
        ? requestError.message
        : "The route service could not be reached. Check your connection and try again.";
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setLoading(false);
        setPendingRequest(null);
      }
    }
  }, [savePlan]);

  const handleResultsReady = useCallback((planId: string) => {
    if (pendingFocusPlanIdRef.current !== planId) return;
    pendingFocusPlanIdRef.current = null;
    document.getElementById("route-results")?.focus({ preventScroll: false });
  }, []);

  const tripFormPanel = (
    <div className="route-workspace__left">
      <TripForm
        onGenerate={handleGenerate}
        loading={loading}
        apiError={error}
        initialRequest={plan?.request}
        onFormChange={handleFormChange}
        onDraftChange={setFormDraft}
        onPrepareResults={handlePrepareResults}
      />
      {plan ? (
        <Suspense fallback={null}>
          <AssumptionsPanel
            assumptions={plan.assumptions}
            warnings={plan.warnings}
            notice={plan.notice}
          />
        </Suspense>
      ) : null}
    </div>
  );

  const routeContent = plan ? (
    <Suspense fallback={<div className="route-results" role="status">Preparing route view…</div>}>
      <GeneratedRouteResults
        plan={plan}
        selectedStopId={selectedStopId}
        onSelectStop={setSelectedStopId}
        onReady={handleResultsReady}
        updating={loading}
      />
    </Suspense>
  ) : loading && pendingRequest ? (
    <RouteGenerationLoading request={pendingRequest} />
  ) : (
    <section className="empty-results empty-results--intro" aria-labelledby="empty-results-title">
      <div className="empty-results__copy empty-results__copy--intro">
        <h2 id="empty-results-title">Your route, stops, and logs in one view</h2>
        <p>Confirm the trip details, then generate a route that accounts for pre-trip inspections, driving limits, breaks, fuel, pickup, and drop-off time.</p>
        <ol>
          <li><span>1</span>Select all three locations.</li>
          <li><span>2</span>Enter hours already used in your 70-hour cycle.</li>
          <li><span>3</span>Generate the route and review each daily log.</li>
        </ol>
      </div>
      <div className="empty-results__map empty-results__map--route">
        <TripRouteArtwork draft={formDraft} standalone />
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <AppHeader landing={!plan && !loading} />
      <main className={`route-workspace ${plan ? "route-workspace--results" : "route-workspace--empty"}${!plan && !loading ? " route-workspace--landing" : ""}${!plan && loading ? " route-workspace--loading" : ""}`}>
        {plan ? routeContent : tripFormPanel}
        {plan ? tripFormPanel : routeContent}
      </main>
    </div>
  );
}
