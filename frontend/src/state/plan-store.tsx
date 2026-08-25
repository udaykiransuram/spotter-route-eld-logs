import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { StoredPlan, TripPlan } from "../types";

const STORAGE_KEY = "spotter.trip-plan.v1";

interface PlanContextValue {
  plan: TripPlan | null;
  savePlan: (plan: TripPlan) => void;
  clearPlan: () => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

function readStoredPlan(): TripPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPlan;
    return stored.version === 1 && isTripPlan(stored.plan) ? stored.plan : null;
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be disabled; use in-memory state only.
    }
    return null;
  }
}

function isTripPlan(value: unknown): value is TripPlan {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TripPlan>;
  return Boolean(
    candidate.id &&
      candidate.route?.geometry?.type === "LineString" &&
      candidate.summary &&
      Array.isArray(candidate.stops) &&
      Array.isArray(candidate.duty_events) &&
      Array.isArray(candidate.daily_logs),
  );
}

export function PlanProvider({ children }: PropsWithChildren) {
  const [plan, setPlan] = useState<TripPlan | null>(readStoredPlan);

  const savePlan = useCallback((nextPlan: TripPlan) => {
    setPlan(nextPlan);
    const stored: StoredPlan = { version: 1, plan: nextPlan };
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // A generated plan still works in memory if storage is unavailable.
    }
  }, []);

  const clearPlan = useCallback(() => {
    setPlan(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be disabled; state is still cleared in memory.
    }
  }, []);

  const value = useMemo(() => ({ plan, savePlan, clearPlan }), [plan, savePlan, clearPlan]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (!context) throw new Error("usePlan must be used within PlanProvider");
  return context;
}

export const planStorageKey = STORAGE_KEY;
