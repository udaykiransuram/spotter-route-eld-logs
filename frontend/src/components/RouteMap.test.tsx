import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapFallback } from "./MapFallback";
import {
  calculateMarkerDisplacements,
  createPersistentFailureTracker,
} from "./route-map-layout";

describe("route map marker layout", () => {
  it("leaves markers at their exact screen point when they do not overlap", () => {
    const offsets = calculateMarkerDisplacements([
      { id: "one", sequence: 1, x: 10, y: 10 },
      { id: "two", sequence: 2, x: 100, y: 100 },
    ]);

    expect(offsets.get("one")).toEqual({ x: 0, y: 0 });
    expect(offsets.get("two")).toEqual({ x: 0, y: 0 });
  });

  it("separates coincident badges while preserving a displacement back to each anchor", () => {
    const points = [
      { id: "one", sequence: 1, x: 50, y: 50 },
      { id: "two", sequence: 2, x: 50, y: 50 },
      { id: "three", sequence: 3, x: 50, y: 50 },
    ];
    const offsets = calculateMarkerDisplacements(points);
    const displayed = points.map((point) => {
      const offset = offsets.get(point.id) ?? { x: 0, y: 0 };
      return { x: point.x + offset.x, y: point.y + offset.y, offset };
    });

    for (let left = 0; left < displayed.length; left += 1) {
      expect(Math.hypot(displayed[left].offset.x, displayed[left].offset.y)).toBeGreaterThan(0);
      for (let right = left + 1; right < displayed.length; right += 1) {
        expect(Math.hypot(
          displayed[left].x - displayed[right].x,
          displayed[left].y - displayed[right].y,
        )).toBeGreaterThanOrEqual(37.9);
      }
    }
  });
});

describe("route map resource health", () => {
  it("tolerates transient failures but reports a persistent burst", () => {
    const tracker = createPersistentFailureTracker(4);

    expect(tracker.recordFailure()).toBe(false);
    expect(tracker.recordFailure()).toBe(false);
    expect(tracker.recordFailure()).toBe(false);
    tracker.reset();
    expect(tracker.recordFailure()).toBe(false);
    expect(tracker.recordFailure()).toBe(false);
    expect(tracker.recordFailure()).toBe(false);
    expect(tracker.recordFailure()).toBe(true);
  });
});

describe("map fallback", () => {
  it("explains that the rest of the trip remains usable after a map failure", () => {
    render(<MapFallback error="WebGL is unavailable." />);

    expect(screen.getByRole("alert")).toHaveTextContent("Route map unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("WebGL is unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("itinerary, stop details, and daily logs are still available");
  });
});
