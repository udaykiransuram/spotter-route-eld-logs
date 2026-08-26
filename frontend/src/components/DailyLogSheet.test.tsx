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
    expect(screen.getByText("duty last 8")).toBeInTheDocument();

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

    const trace = container.querySelector("[data-trace-path]");
    const segmentCount = tripPlanFixture.daily_logs[0].segments.length;
    expect(trace).toHaveAttribute("data-segment-count", String(segmentCount));
    expect(trace).toHaveAttribute("data-transition-count", String(segmentCount - 1));
    expect(trace).toHaveAttribute("stroke-linecap", "butt");
    expect(trace).toHaveAttribute("stroke-linejoin", "round");

    const traceDefinition = trace?.getAttribute("d") ?? "";
    expect(traceDefinition.match(/\bM\b/g)).toHaveLength(1);
    expect(traceDefinition.match(/\bH\b/g)).toHaveLength(segmentCount);
    expect(traceDefinition.match(/\bV\b/g)).toHaveLength(segmentCount - 1);
    const traceCoordinates = [...traceDefinition.matchAll(/[MH]\s+([\d.]+)/g)]
      .map((match) => Number(match[1]));
    expect(Math.min(...traceCoordinates)).toBeGreaterThanOrEqual(64);
    expect(Math.max(...traceCoordinates)).toBeLessThanOrEqual(454);
  });

  it("uses one location/activity description for each operational non-driving period bracket", () => {
    const firstLog = tripPlanFixture.daily_logs[0];
    const log = {
      ...firstLog,
      remarks: [
        { event_id: "break", time: "13:30", minute: 810, status: "off_duty" as const, location: "Knoxville, TN", activity: "Meal/rest break", note: "30-minute break." },
        { event_id: "resume-break", time: "14:00", minute: 840, status: "driving" as const, location: "Knoxville, TN", activity: "Driving", note: "Resume driving." },
        { event_id: "pickup", time: "15:00", minute: 900, status: "on_duty" as const, location: "Nashville, TN", activity: "Pickup", note: "Pickup." },
        { event_id: "resume-pickup", time: "16:00", minute: 960, status: "driving" as const, location: "Nashville, TN", activity: "Driving", note: "Resume driving." },
      ],
    };
    const { container } = render(<DailyLogSheet log={log} />);

    const boundaries = [...container.querySelectorAll("[data-location-boundary]")];
    expect(boundaries).toHaveLength(4);
    expect(boundaries.map((boundary) => Number(boundary.getAttribute("x1")))).toEqual([
      283.375,
      291.5,
      307.75,
      324,
    ]);
    const knoxville = container.querySelector('[data-location-annotation][data-start-minute="810"]');
    expect(knoxville).toHaveAttribute("data-end-minute", "840");
    expect(knoxville).toHaveAttribute("data-boundary-count", "2");
    expect(knoxville).toHaveTextContent("Knoxville, TN");
    expect(knoxville).toHaveAttribute("data-activity", "Meal/rest break");
    expect(knoxville?.querySelector("[data-location-label]"))
      .toHaveAttribute("aria-label", "Knoxville, TN / Meal break");
    expect(container.querySelector('[data-location-annotation][data-status="driving"]'))
      .not.toBeInTheDocument();
    const directLabels = [...container.querySelectorAll("[data-location-label]")];
    expect(directLabels).toHaveLength(2);
    expect(directLabels.every((label) => label.getAttribute("font-size") === "7.2"))
      .toBe(true);
    expect(directLabels.every((label) => label.getAttribute("transform")?.startsWith("rotate(-50")))
      .toBe(true);
    expect(directLabels.every((label) => label.getAttribute("text-anchor") === "end"))
      .toBe(true);
    expect(directLabels.every((label) => label.getAttribute("data-label-row") === "0"))
      .toBe(true);
    expect(directLabels.every((label) => label.querySelectorAll("tspan")[1]?.getAttribute("dy") === "12"))
      .toBe(true);
    const separators = [...container.querySelectorAll("[data-location-separator]")];
    expect(separators).toHaveLength(2);
    expect(separators.every((separator) => separator.getAttribute("transform")?.startsWith("rotate(-50")))
      .toBe(true);
    expect(container.querySelectorAll("[data-location-bracket]")).toHaveLength(2);
    expect(container.querySelectorAll('[data-location-annotation][data-start-minute="810"]'))
      .toHaveLength(1);
  });

  it("keeps an early first-period label centered on its bracket using the shared layout rule", () => {
    const firstLog = tripPlanFixture.daily_logs[0];
    const log = {
      ...firstLog,
      remarks: [
        { event_id: "early-break", time: "01:30", minute: 90, status: "off_duty" as const, location: "Kingston, TN", activity: "Meal/rest break", note: "Meal break." },
        { event_id: "early-resume", time: "02:00", minute: 120, status: "driving" as const, location: "Kingston, TN", activity: "Driving", note: "Resume driving." },
      ],
    };
    const { container } = render(<DailyLogSheet log={log} />);

    const annotation = container.querySelector(
      '[data-location-annotation][data-start-minute="90"]',
    );
    const connector = annotation?.querySelector("[data-location-connector]");
    const coordinates = connector?.getAttribute("d")?.match(
      /^M ([\d.]+) [\d.]+ L ([\d.]+) [\d.]+$/,
    );

    expect(coordinates).not.toBeNull();
    expect(Number(coordinates?.[2])).toBeCloseTo(Number(coordinates?.[1]), 3);
  });

  it("brackets the projected trip-complete period through the end of the log day", () => {
    const finalLog = tripPlanFixture.daily_logs.at(-1)!;
    const { container } = render(<DailyLogSheet log={finalLog} />);

    const tripComplete = container.querySelector(
      '[data-location-annotation][data-activity="Trip complete"]',
    );
    expect(tripComplete).toHaveAttribute("data-end-minute", "1440");
    expect(tripComplete?.querySelector("[data-location-label]"))
      .toHaveAttribute("aria-label", "Dallas, TX / Trip complete");
    expect(container.querySelectorAll('[data-location-annotation][data-activity="Trip complete"]'))
      .toHaveLength(1);
    expect(container.querySelector('[data-location-bracket][data-activity="Trip complete"]'))
      .toHaveAttribute("data-end-minute", "1440");
  });

  it("keeps driving and sleeper periods out of the paper remark labels", () => {
    const log = tripPlanFixture.daily_logs[1];
    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelector('[data-location-annotation][data-status="driving"]'))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-location-annotation][data-status="sleeper_berth"]'))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-location-bracket][data-activity="Sleeper berth"]'))
      .not.toBeInTheDocument();
  });

  it("uses projected minutes for repeated DST clock times and keeps midnight edges bounded", () => {
    const log = {
      ...tripPlanFixture.daily_logs[0],
      remarks: [
        { event_id: "midnight", time: "00:00", minute: 0, status: "off_duty" as const, location: "Albany, NY", note: "Continued rest." },
        { event_id: "first-130", time: "01:30", minute: 90, status: "driving" as const, location: "Utica, NY", note: "First 01:30." },
        { event_id: "second-130", time: "01:30", minute: 150, status: "off_duty" as const, location: "Syracuse, NY", note: "Second 01:30." },
        { event_id: "day-end", time: "24:00", status: "off_duty" as const, location: "Buffalo, NY", note: "Day end." },
      ],
    };
    const { container } = render(<DailyLogSheet log={log} />);

    const boundaries = [...container.querySelectorAll("[data-location-boundary]")];
    expect(boundaries.map((boundary) => Number(boundary.getAttribute("x1")))).toEqual([
      64,
      88.375,
      104.625,
      454,
    ]);
    expect(boundaries[1]).toHaveAttribute("data-minute", "90");
    expect(boundaries[2]).toHaveAttribute("data-minute", "150");
    expect(container.querySelector('[data-location-bracket][data-start-minute="1440"]'))
      .not.toBeInTheDocument();
  });

  it("keeps every dense-day location in the printable numbered legend", () => {
    const log = {
      ...tripPlanFixture.daily_logs[0],
      remarks: [
        ...Array.from({ length: 12 }, (_, index) => ({
          event_id: `dense-${index}`,
          time: `${String(index * 2).padStart(2, "0")}:00`,
          minute: index * 120,
          status: index % 2 ? "off_duty" as const : "on_duty" as const,
          location: `Location ${index + 1}, TX`,
          activity: `Duty entry ${index + 1}`,
          note: `Duty entry ${index + 1}.`,
        })),
        {
          event_id: "dense-day-end",
          time: "24:00",
          minute: 1440,
          status: "driving" as const,
          location: "End location, TX",
          activity: "Driving",
          note: "End of day.",
        },
      ],
    };
    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelectorAll("[data-location-boundary]")).toHaveLength(13);
    expect(container.querySelectorAll("[data-location-bracket]")).toHaveLength(12);
    expect(container.querySelectorAll("[data-location-legend-entry]")).toHaveLength(12);
    expect(container.querySelector("[data-location-label]")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("See on-screen remarks");
  });

  it("labels and renders the estimated 70-hour recap without implying 60-hour data", () => {
    const firstLog = tripPlanFixture.daily_logs[0];
    const { container } = render(<DailyLogSheet log={firstLog} />);

    const drivingMiles = container.querySelector('[data-paper-field="total-miles-driving-today"]');
    const totalMileage = container.querySelector('[data-paper-field="total-mileage-today"]');
    expect(drivingMiles).toHaveTextContent(String(Math.round(firstLog.total_miles)));
    expect(totalMileage).toHaveTextContent(String(Math.round(firstLog.total_miles)));
    expect(totalMileage?.textContent).toBe(drivingMiles?.textContent);

    expect(container.querySelector('[data-paper-recap="on-duty-today"]')).toHaveTextContent(firstLog.recap!.on_duty_today.toFixed(2));
    expect(container.querySelector('[data-paper-field="remarks-total"]')).toHaveTextContent("=24");
    expect(container.querySelector('[data-paper-recap="estimate-label"]')).toHaveTextContent("Estimated from cycle total");
    expect(container.querySelector('[data-paper-recap="estimate-label"]')).toHaveAttribute("y", "438");
    expect(container.querySelector('[data-paper-recap="seventy-hour-a"]')).toHaveTextContent(firstLog.recap!.seventy_hour_a!.toFixed(2));
    expect(container.querySelector('[data-paper-recap="seventy-hour-b"]')).toHaveTextContent(firstLog.recap!.seventy_hour_b!.toFixed(2));
    expect(container.querySelector('[data-paper-recap="seventy-hour-c"]')).toHaveTextContent(firstLog.recap!.seventy_hour_c!.toFixed(2));
    const notApplicableFields = [
      ...container.querySelectorAll('[data-paper-recap="sixty-hour-not-applicable"]'),
    ];
    expect(notApplicableFields).toHaveLength(3);
    expect(notApplicableFields.every((field) => field.textContent === "N/A")).toBe(true);

    expect(screen.getByRole("img", { name: new RegExp(`70-hour recap estimates: A ${firstLog.recap!.seventy_hour_a!.toFixed(2)}, B ${firstLog.recap!.seventy_hour_b!.toFixed(2)}, and C ${firstLog.recap!.seventy_hour_c!.toFixed(2)} hours`, "i") }))
      .toHaveAccessibleName(/Estimate basis: Conservative 70-hour\/8-day estimate/i);
  });

  it("uses labeled estimates for a legacy stored recap without the new estimate block", () => {
    const firstLog = tripPlanFixture.daily_logs[0];
    const legacyLog = {
      ...firstLog,
      recap: {
        on_duty_today: firstLog.recap!.on_duty_today,
        cycle_used_at_start: firstLog.recap!.cycle_used_at_start,
        cycle_used_at_end: firstLog.recap!.cycle_used_at_end,
        remaining_cycle_hours: firstLog.recap!.remaining_cycle_hours,
        restart_completed: firstLog.recap!.restart_completed,
      },
    };

    const { container } = render(<DailyLogSheet log={legacyLog} />);

    expect(container.querySelector('[data-paper-recap="estimate-label"]')).toHaveTextContent("Estimated from cycle total");
    expect(container.querySelector('[data-paper-recap="seventy-hour-a"]')).toHaveTextContent(firstLog.recap!.cycle_used_at_end.toFixed(2));
    expect(container.querySelector('[data-paper-recap="seventy-hour-b"]')).toHaveTextContent(firstLog.recap!.remaining_cycle_hours.toFixed(2));
    expect(container.querySelector('[data-paper-recap="seventy-hour-c"]')).toHaveTextContent(firstLog.recap!.cycle_used_at_end.toFixed(2));
    expect(screen.getByRole("img", { name: /prior daily history was not supplied/i })).toBeInTheDocument();
  });

  it("does not hide on-duty cycle hours above the driving limit", () => {
    const firstLog = tripPlanFixture.daily_logs[0];
    const log = {
      ...firstLog,
      cycle_used_hours: 71,
      recap: {
        ...firstLog.recap!,
        cycle_used_at_end: 71,
        remaining_cycle_hours: 0,
        seventy_hour_a: 71,
        seventy_hour_b: 0,
        seventy_hour_c: 71,
      },
    };

    const { container } = render(<DailyLogSheet log={log} />);

    expect(container.querySelector('[data-paper-recap="seventy-hour-a"]')).toHaveTextContent("71.00");
    expect(container.querySelector('[data-paper-recap="seventy-hour-b"]')).toHaveTextContent("0.00");
    expect(container.querySelector('[data-paper-recap="seventy-hour-c"]')).toHaveTextContent("71.00");
    expect(screen.getByRole("img", { name: /A 71.00, B 0.00, and C 71.00 hours/i })).toBeInTheDocument();
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

  it("ellipsizes and clips long paper locations while preserving the full accessible remark elsewhere", () => {
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

    expect(container.querySelector("[data-location-label]")?.textContent).toContain("…");
    expect(container.querySelector(".log-location-timeline")).toHaveAttribute("clip-path");
  });

  it("clips every fixed metadata field to its bounded paper region", () => {
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
    expect(container.querySelectorAll("clipPath")).toHaveLength(9);
  });
});
