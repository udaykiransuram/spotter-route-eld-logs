import { render, screen } from "@testing-library/react";
import { tripPlanFixture } from "../test/fixture";
import { DailyLogSheet } from "./DailyLogSheet";
import { describe, expect, it } from "vitest";

describe("DailyLogSheet", () => {
  it("renders a crisp vector form, metadata, and a bounded 24-hour trace", () => {
    const { container } = render(<DailyLogSheet log={tripPlanFixture.daily_logs[0]} metadata={tripPlanFixture.request?.metadata} />);
    expect(screen.getByRole("img", { name: /Filled driver's daily log for 2026-08-25/ })).toBeInTheDocument();
    const svg = container.querySelector(".log-sheet svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 513 518");
    expect(svg?.querySelector(".daily-log-template")).toBeInTheDocument();
    expect(svg?.querySelector("image, foreignObject")).not.toBeInTheDocument();
    expect(svg?.querySelector("desc")).toHaveTextContent("totaling 24.00 hours");
    expect(container.querySelector('[data-paper-field="date-month"]')).toHaveAttribute("x", "187");
    expect(container.querySelector('[data-paper-field="date-month"]')).toHaveAttribute("y", "17.5");
    expect(container.querySelector('[data-paper-field="date-day"]')).toHaveAttribute("x", "229");
    expect(container.querySelector('[data-paper-field="date-year"]')).toHaveAttribute("x", "271.5");

    const recapColumns = [...container.querySelectorAll("[data-recap-column]")];
    expect(recapColumns).toHaveLength(6);
    expect(recapColumns.every((column) => column.getAttribute("font-size") === "5")).toBe(true);
    const boundedRecapLines = [...container.querySelectorAll('[data-recap-column] text[textLength="33"]')];
    expect(boundedRecapLines).toHaveLength(4);
    expect(boundedRecapLines.every((line) => line.getAttribute("lengthAdjust") === "spacingAndGlyphs")).toBe(true);
    expect(screen.getAllByText("minus A*")).toHaveLength(2);

    const statusRows = [...container.querySelectorAll("[data-status-row]")];
    expect(statusRows.map((row) => row.getAttribute("data-status-row"))).toEqual([
      "off_duty",
      "sleeper_berth",
      "driving",
      "on_duty",
    ]);
    expect(statusRows.map((row) => row.getAttribute("data-label"))).toEqual([
      "1. Off Duty",
      "2. Sleeper Berth",
      "3. Driving",
      "4. On Duty (not driving)",
    ]);
    expect(container.querySelectorAll('[data-grid-line="hour"]')).toHaveLength(25);
    expect(container.querySelectorAll('[data-grid-line="quarter-hour"]')).toHaveLength(72);
    expect(container.querySelectorAll('[data-grid-line="row-boundary"]')).toHaveLength(5);
    expect(screen.getByText("Spotter Logistics")).toBeInTheDocument();
    expect(screen.getByText("BOL-9921")).toBeInTheDocument();

    const traceSegments = container.querySelectorAll("[data-trace-segment]");
    const traceTransitions = container.querySelectorAll("[data-trace-transition]");
    expect(traceSegments).toHaveLength(tripPlanFixture.daily_logs[0].segments.length);
    expect(traceTransitions).toHaveLength(tripPlanFixture.daily_logs[0].segments.length - 1);
    const traceLines = container.querySelectorAll(".log-trace line");
    for (const line of traceLines) {
      const x1 = Number(line.getAttribute("x1"));
      const x2 = Number(line.getAttribute("x2"));
      expect(x1).toBeGreaterThanOrEqual(64);
      expect(x1).toBeLessThanOrEqual(454);
      expect(x2).toBeGreaterThanOrEqual(64);
      expect(x2).toBeLessThanOrEqual(454);
    }
  });

  it("keeps the city in international paper locations", () => {
    const log = {
      ...tripPlanFixture.daily_logs[0],
      from_location: "London, England, United Kingdom",
      to_location: "Paris, Île-de-France, France",
    };
    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelector('[data-paper-field="from"]')).toHaveTextContent("London, ENG");
    expect(container.querySelector('[data-paper-field="to"]')).toHaveTextContent("Paris, Île-de-France");
  });

  it("preserves cities for countries outside a fixed country list and keeps US shortening", () => {
    const log = {
      ...tripPlanFixture.daily_logs[0],
      from_location: "Lagos, Lagos State, Nigeria",
      to_location: "1429 Valley Home Road, Dandridge, TN 37725, United States of America",
    };
    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelector('[data-paper-field="from"]')).toHaveTextContent("Lagos, Lagos State");
    expect(container.querySelector('[data-paper-field="to"]')).toHaveTextContent("Dandridge, TN");
  });

  it("keeps route-mile thousands separators intact on the paper log", () => {
    const log = {
      ...tripPlanFixture.daily_logs[0],
      from_location: "Route mile 1,276",
      to_location: "Route mile 3, 509",
    };
    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelector('[data-paper-field="from"]')).toHaveTextContent("Route mile 1,276");
    expect(container.querySelector('[data-paper-field="to"]')).toHaveTextContent("Route mile 3,509");
  });

  it("ellipsizes and clips long paper remarks while preserving the full accessible remark elsewhere", () => {
    const firstRemark = tripPlanFixture.daily_logs[0].remarks[0];
    const log = {
      ...tripPlanFixture.daily_logs[0],
      remarks: [{
        ...firstRemark,
        note: `Unexpected duty-status change ${"with additional operational context ".repeat(8)}`,
        location: `Very long facility location ${"and surrounding area ".repeat(7)}`,
      }],
    };
    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelector("[data-paper-remark]")?.textContent).toContain("…");
    expect(container.querySelector('[data-paper-remark]')?.parentElement).toHaveAttribute("clip-path");
  });

  it("clips every fixed metadata field with a visible continuation marker", () => {
    const metadata = {
      driver_name: `Driver-${"D".repeat(113)}`,
      carrier_name: `Carrier-${"C".repeat(152)}`,
      main_office_address: `Office-${"O".repeat(193)}`,
      home_terminal_address: `Terminal-${"T".repeat(191)}`,
      vehicle_number: `Vehicle-${"V".repeat(72)}`,
      shipping_document_number: `Document-${"S".repeat(91)}`,
    };
    const { container } = render(<DailyLogSheet log={tripPlanFixture.daily_logs[0]} metadata={metadata} />);

    for (const field of ["driver", "carrier", "main-office", "home-terminal", "vehicle", "shipping-document"]) {
      expect(container.querySelector(`[data-paper-field="${field}"]`)?.textContent).toContain("…");
    }
    const vehicle = container.querySelector('[data-paper-field="vehicle"]');
    expect(vehicle?.textContent).toMatch(/^Vehicle-.*…$/);
    expect(vehicle).toHaveAttribute("textLength", "150");
    expect(vehicle).toHaveAttribute("lengthAdjust", "spacingAndGlyphs");
    const shippingDocument = container.querySelector('[data-paper-field="shipping-document"]');
    expect(shippingDocument?.textContent).toMatch(/^Document-.*…$/);
    expect(shippingDocument).toHaveAttribute("textLength", "64");
    expect(shippingDocument).toHaveAttribute("lengthAdjust", "spacingAndGlyphs");
    expect(container.querySelector('[data-paper-field="carrier"] tspan')).toHaveAttribute("textLength", "228");
    expect(container.querySelector('[data-paper-field="main-office"]')).toHaveAttribute("textLength", "228");
    expect(container.querySelector('[data-paper-field="home-terminal"]')).toHaveAttribute("textLength", "228");
    expect(container.querySelector('[data-paper-field="driver"]')).toHaveAttribute("textLength", "278");
    expect(container.querySelector("[data-paper-continuation]")).toHaveTextContent("full value on supplemental page");
    expect(container.querySelectorAll("clipPath")).toHaveLength(9);
  });
});
