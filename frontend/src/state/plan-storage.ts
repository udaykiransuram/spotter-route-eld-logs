import { isTripPlan } from "../lib/plan-contract";
import type { StoredPlan, TripPlan } from "../types";

export const planStorageKey = "spotter.trip-plan.v1";

export function readStoredPlan(): TripPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(planStorageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPlan;
    if (stored.version === 1 && isTripPlan(stored.plan)) return stored.plan;
    window.sessionStorage.removeItem(planStorageKey);
    return null;
  } catch {
    try {
      window.sessionStorage.removeItem(planStorageKey);
    } catch {
      // Storage may be disabled; use in-memory state only.
    }
    return null;
  }
}

export function storePlan(plan: TripPlan) {
  const stored: StoredPlan = { version: 1, plan };
  try {
    window.sessionStorage.setItem(planStorageKey, JSON.stringify(stored));
  } catch {
    // A generated plan still works in memory if storage is unavailable.
  }
}

export function removeStoredPlan() {
  try {
    window.sessionStorage.removeItem(planStorageKey);
  } catch {
    // Clearing in-memory state still removes the generated plan from the UI.
  }
}
