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

  it("separates coincident badges while retaining their exact shared anchor", () => {
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

    expect(displayed.filter(({ offset }) => Math.hypot(offset.x, offset.y) > 0)).toHaveLength(2);
    for (let left = 0; left < displayed.length; left += 1) {
      for (let right = left + 1; right < displayed.length; right += 1) {
        expect(Math.hypot(
          displayed[left].x - displayed[right].x,
          displayed[left].y - displayed[right].y,
        )).toBeGreaterThanOrEqual(37.9);
      }
    }
  });

  it("keeps coincident stops in chronological left-to-right order", () => {
    const points = [
      { id: "twelve", sequence: 12, x: 50, y: 50 },
      { id: "eleven", sequence: 11, x: 50, y: 50 },
    ];
    const offsets = calculateMarkerDisplacements(points);
    const displayedBySequence = points
      .map((point) => {
        const offset = offsets.get(point.id) ?? { x: 0, y: 0 };
        return {
          sequence: point.sequence,
          x: point.x + offset.x,
          y: point.y + offset.y,
        };
      })
      .sort((left, right) => left.sequence - right.sequence);

    expect(displayedBySequence[0].x).toBeLessThan(displayedBySequence[1].x);
    expect(displayedBySequence[0].y).toBeCloseTo(displayedBySequence[1].y, 6);
  });

  it("keeps clustered badges ordered along the local route direction", () => {
    const points = [
      { id: "twelve", sequence: 12, x: 90, y: 82 },
      { id: "ten", sequence: 10, x: 70, y: 70 },
      { id: "eleven", sequence: 11, x: 80, y: 76 },
    ];
    const offsets = calculateMarkerDisplacements(points);
    const routeLength = Math.hypot(20, 12);
    const routeAxis = { x: 20 / routeLength, y: 12 / routeLength };
    const displayedProjections = points
      .map((point) => {
        const offset = offsets.get(point.id) ?? { x: 0, y: 0 };
        const displayedX = point.x + offset.x;
        const displayedY = point.y + offset.y;
        return {
          sequence: point.sequence,
          projection: displayedX * routeAxis.x + displayedY * routeAxis.y,
        };
      })
      .sort((left, right) => left.sequence - right.sequence);

    expect(displayedProjections[0].projection).toBeLessThan(displayedProjections[1].projection);
    expect(displayedProjections[1].projection).toBeLessThan(displayedProjections[2].projection);
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
  it("keeps the loading state accessible while the route map initializes", () => {
    render(<MapFallback />);

    expect(screen.getByRole("status")).toHaveClass("map-fallback--loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading route map…");
  });

  it("shows a richer preview of what the generated route will contain", () => {
    const { container } = render(<MapFallback loading={false} />);

    const fallback = screen.getByRole("group", { name: "Generated route preview" });
    expect(fallback).toHaveClass("map-fallback--empty");
    expect(screen.getByText("Your generated route will appear here.").tagName).toBe("STRONG");
    expect(fallback).toHaveTextContent(
      "After you generate, this area will show your route, recommended stops, and daily log summaries.",
    );
    expect(container.querySelector(".map-fallback__motif")).toBeInTheDocument();
    expect(container.querySelector(".map-fallback__icon")).toBeInTheDocument();
  });

  it("explains that the rest of the trip remains usable after a map failure", () => {
    render(<MapFallback error="WebGL is unavailable." />);

    expect(screen.getByRole("alert")).toHaveClass("map-fallback--error");
    expect(screen.getByRole("alert")).toHaveTextContent("Route map unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("WebGL is unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("itinerary, stop details, and daily logs are still available");
  });
});
