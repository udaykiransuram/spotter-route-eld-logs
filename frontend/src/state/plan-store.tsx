import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import type { TripPlan } from "../types";
import { PlanContext } from "./plan-context";
import { readStoredPlan, storePlan } from "./plan-storage";

export function PlanProvider({ children }: PropsWithChildren) {
  const [plan, setPlan] = useState<TripPlan | null>(readStoredPlan);

  const savePlan = useCallback((nextPlan: TripPlan) => {
    setPlan(nextPlan);
  }, []);

  useEffect(() => {
    if (!plan) return;
    const persist = () => storePlan(plan);
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(persist, { timeout: 1_000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(persist, 0);
    return () => window.clearTimeout(timer);
  }, [plan]);

  const value = useMemo(() => ({ plan, savePlan }), [plan, savePlan]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
