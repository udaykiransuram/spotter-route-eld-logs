import { createContext, useContext } from "react";
import type { TripPlan } from "../types";

export interface PlanContextValue {
  plan: TripPlan | null;
  savePlan: (plan: TripPlan) => void;
}

export const PlanContext = createContext<PlanContextValue | null>(null);

export function usePlan() {
  const context = useContext(PlanContext);
  if (!context) throw new Error("usePlan must be used within PlanProvider");
  return context;
}
