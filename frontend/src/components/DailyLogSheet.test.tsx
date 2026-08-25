import { render, screen } from "@testing-library/react";
import { tripPlanFixture } from "../test/fixture";
import { DailyLogSheet } from "./DailyLogSheet";
import { describe, expect, it } from "vitest";

describe("DailyLogSheet", () => {
  it("renders the official background, metadata, and a bounded 24-hour trace", () => {
    const { container } = render(<DailyLogSheet log={tripPlanFixture.daily_logs[0]} metadata={tripPlanFixture.request?.metadata} />);
    expect(screen.getByRole("img", { name: /Filled driver's daily log for 2026-08-25/ })).toBeInTheDocument();
    expect(container.querySelector('image[href="/blank-paper-log.png"]')).toBeInTheDocument();
    expect(screen.getByText("Spotter Logistics")).toBeInTheDocument();
    expect(screen.getByText("BOL-9921")).toBeInTheDocument();

    const traceLines = container.querySelectorAll(".log-trace line");
    expect(traceLines.length).toBeGreaterThan(tripPlanFixture.daily_logs[0].segments.length);
    for (const line of traceLines) {
      const x1 = Number(line.getAttribute("x1"));
      const x2 = Number(line.getAttribute("x2"));
      expect(x1).toBeGreaterThanOrEqual(66);
      expect(x1).toBeLessThanOrEqual(454);
      expect(x2).toBeGreaterThanOrEqual(66);
      expect(x2).toBeLessThanOrEqual(454);
    }
  });
});
