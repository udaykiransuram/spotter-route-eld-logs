import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { PlanProvider, planStorageKey } from "../state/plan-store";
import stylesSource from "../styles.css?raw";
import { tripPlanFixture } from "../test/fixture";

function renderLogs(plan = tripPlanFixture) {
  sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan }));
  return render(<MemoryRouter initialEntries={["/logs"]}><PlanProvider><App /></PlanProvider></MemoryRouter>);
}

describe("Daily logs page", () => {
  it("switches day tabs and keeps summaries and remarks readable", async () => {
    const user = userEvent.setup();
    renderLogs();

    expect(screen.getByRole("heading", { name: "Daily logs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Aug 25 · Day 1/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("490 mi")).toBeInTheDocument();
    expect(screen.getByText("24.00 h")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "70-hour cycle used" })).toHaveAttribute("aria-valuenow", "39.5");
    expect(screen.getByText("Sheet 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Generated trip plan — not a certified ELD record.")).toBeInTheDocument();
    expect(screen.getAllByText(/Off duty → Driving/).length).toBeGreaterThan(0);
    const paperRegion = screen.getByRole("region", { name: "Driver's daily log sheet" });
    expect(paperRegion).toHaveAttribute("tabindex", "0");
    expect(paperRegion).toHaveAccessibleDescription("Swipe or scroll horizontally to read the full paper log.");
    const metadataSection = screen.getByRole("heading", { name: "Driver, carrier & document details" }).closest("section");
    expect(metadataSection).not.toBeNull();
    expect(within(metadataSection as HTMLElement).getByText("123 Dispatch Way, Richmond, VA 23219")).toBeInTheDocument();
    expect(within(metadataSection as HTMLElement).getByText("880 Terminal Road, Richmond, VA 23224")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Aug 26 · Day 2/ }));
    expect(screen.getByRole("tab", { name: /Aug 26 · Day 2/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("860 mi")).toBeInTheDocument();
    expect(screen.getByText("13.50 h")).toBeInTheDocument();
    expect(screen.getByText("Sheet 2 of 2")).toBeInTheDocument();
  });

  it("supports previous/next navigation and printing", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    renderLogs();

    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".print-log-page")).toHaveLength(2);
    expect(document.querySelectorAll(".print-log-details-page")).toHaveLength(2);
    expect(document.querySelectorAll(".print-log-page .daily-log-template")).toHaveLength(2);
    expect(document.querySelectorAll(".print-log-page image, .print-log-page foreignObject")).toHaveLength(0);
    for (const page of document.querySelectorAll(".print-log-page")) {
      expect(page.querySelectorAll(":scope > .log-sheet > svg")).toHaveLength(1);
    }
    for (const details of document.querySelectorAll(".print-log-details-metadata")) {
      expect(details).toHaveTextContent("123 Dispatch Way, Richmond, VA 23219");
      expect(details).toHaveTextContent("880 Terminal Road, Richmond, VA 23224");
    }
  });

  it("preserves long unbroken metadata in screen and print details", () => {
    const longOffice = `OFFICE-${"X".repeat(193)}`;
    const longTerminal = `TERMINAL-${"Y".repeat(191)}`;
    const thirdLog = { ...tripPlanFixture.daily_logs[1], date: "2026-08-27" };
    renderLogs({
      ...tripPlanFixture,
      request: {
        ...tripPlanFixture.request!,
        metadata: {
          driver_name: "D".repeat(120),
          carrier_name: "C".repeat(160),
          main_office_address: longOffice,
          home_terminal_address: longTerminal,
          vehicle_number: "V".repeat(80),
          shipping_document_number: "S".repeat(100),
        },
      },
      daily_logs: [...tripPlanFixture.daily_logs, thirdLog],
    });

    const metadataSection = screen.getByRole("heading", { name: "Driver, carrier & document details" }).closest("section");
    expect(within(metadataSection as HTMLElement).getByText(longOffice)).toBeInTheDocument();
    expect(within(metadataSection as HTMLElement).getByText(longTerminal)).toBeInTheDocument();
    const printMetadata = document.querySelector(".print-log-details-metadata");
    expect(printMetadata).toHaveTextContent(longOffice);
    expect(printMetadata).toHaveTextContent(longTerminal);
    expect(document.querySelectorAll(".print-log-page")).toHaveLength(3);
    expect(document.querySelectorAll(".print-log-details-page")).toHaveLength(3);
    expect(document.querySelectorAll(".print-all-logs > *")).toHaveLength(6);
    expect(document.querySelectorAll(".print-log-details-page footer")).toHaveLength(0);
    for (const details of document.querySelectorAll(".print-log-details-page")) {
      expect(details).toHaveTextContent("not a certified ELD record");
    }
  });

  it("keeps supplemental print pages in normal flow and allows vertical touch scrolling", () => {
    const supplementalRule = stylesSource.match(/\.print-log-details-page\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(supplementalRule).toContain("display: block");
    expect(supplementalRule).not.toMatch(/display:\s*flex/);
    expect(supplementalRule).not.toMatch(/min-height/);
    expect(supplementalRule).not.toMatch(/flex-direction/);
    expect(stylesSource).not.toContain(".print-log-details-page footer");
    expect(stylesSource).toContain("overflow-x: auto");
    expect(stylesSource).not.toMatch(/touch-action:\s*pan-x/);
  });

  it("explains DST projection and distinguishes repeated fall-back clock times", () => {
    const gridNote = "Daylight-saving fall-back: the 25-hour local day is projected proportionally onto this 24-hour paper grid.";
    const firstLog = {
      ...tripPlanFixture.daily_logs[0],
      grid_note: gridNote,
      remarks: [
        { ...tripPlanFixture.daily_logs[0].remarks[0], time: "01:30", timezone_abbreviation: "EDT" },
        { ...tripPlanFixture.daily_logs[0].remarks[1], time: "01:30", timezone_abbreviation: "EST" },
      ],
    };
    renderLogs({ ...tripPlanFixture, daily_logs: [firstLog, tripPlanFixture.daily_logs[1]] });

    const gridNoteRegion = screen.getByRole("note", { name: "Daylight-saving time-grid note" });
    expect(gridNoteRegion).toHaveTextContent(gridNote);
    const remarksSection = screen.getByRole("heading", { name: "Duty-status remarks" }).closest("section");
    expect(within(remarksSection as HTMLElement).getByText("01:30 EDT")).toBeInTheDocument();
    expect(within(remarksSection as HTMLElement).getByText("01:30 EST")).toBeInTheDocument();

    const printDetails = document.querySelector(".print-log-details-page");
    expect(printDetails).not.toBeNull();
    expect(within(printDetails as HTMLElement).getByText(gridNote)).toBeInTheDocument();
    expect(within(printDetails as HTMLElement).getByText("01:30 EDT")).toBeInTheDocument();
    expect(within(printDetails as HTMLElement).getByText("01:30 EST")).toBeInTheDocument();
  });
});
