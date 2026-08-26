import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { PlanProvider } from "../state/plan-store";
import { planStorageKey } from "../state/plan-storage";
import { tripPlanFixture } from "../test/fixture";
import { formatMiles } from "../lib/format";

function renderLogs(plan = tripPlanFixture) {
  sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan }));
  return render(<MemoryRouter initialEntries={["/logs"]}><PlanProvider><App /></PlanProvider></MemoryRouter>);
}

describe("Daily logs page", () => {
  it("switches day tabs and keeps summaries and remarks readable", async () => {
    const user = userEvent.setup();
    renderLogs();

    expect(await screen.findByRole("heading", { name: "Daily logs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Aug 25 · Day 1/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(formatMiles(tripPlanFixture.daily_logs[0].total_miles))).toBeInTheDocument();
    expect(screen.getByText("24.00 h")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "70-hour cycle used" })).toHaveAttribute("aria-valuenow", String(tripPlanFixture.daily_logs[0].recap!.cycle_used_at_end));
    expect(screen.getByText(`Sheet 1 of ${tripPlanFixture.daily_logs.length}`)).toBeInTheDocument();
    expect(screen.getByText("Generated trip plan — not a certified ELD record.")).toBeInTheDocument();
    expect(screen.getAllByText(/pre-trip inspection/i).length).toBeGreaterThan(0);
    const paperRegion = screen.getByRole("region", { name: "Driver's daily log sheet" });
    expect(paperRegion).toHaveAttribute("tabindex", "0");
    expect(paperRegion).toHaveAccessibleDescription("The paper log fits the screen. Use full screen to inspect small details.");
    const metadataSection = screen.getByRole("heading", { name: "Driver, carrier & document details" }).closest("section");
    expect(metadataSection).not.toBeNull();
    expect(within(metadataSection as HTMLElement).getByText("123 Dispatch Way, Richmond, VA 23219")).toBeInTheDocument();
    expect(within(metadataSection as HTMLElement).getByText("880 Terminal Road, Richmond, VA 23224")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Aug 26 · Day 2/ }));
    expect(screen.getByRole("tab", { name: /Aug 26 · Day 2/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(formatMiles(tripPlanFixture.daily_logs[1].total_miles))).toBeInTheDocument();
    expect(screen.getAllByText(`${tripPlanFixture.daily_logs[1].status_totals.driving.toFixed(2)} h`).length).toBeGreaterThan(0);
    expect(screen.getByText(`Sheet 2 of ${tripPlanFixture.daily_logs.length}`)).toBeInTheDocument();
  });

  it("supports previous/next navigation and printing", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    renderLogs();

    expect(await screen.findByRole("button", { name: "Previous day" })).toBeDisabled();
    for (let index = 1; index < tripPlanFixture.daily_logs.length; index += 1) {
      await user.click(screen.getByRole("button", { name: "Next day" }));
    }
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".print-log-page")).toHaveLength(tripPlanFixture.daily_logs.length);
    expect(document.querySelectorAll(".print-log-page .daily-log-template")).toHaveLength(tripPlanFixture.daily_logs.length);
    expect(document.querySelectorAll(".print-log-page image, .print-log-page foreignObject")).toHaveLength(0);
    for (const page of document.querySelectorAll(".print-log-page")) {
      expect(page.querySelectorAll(":scope > .log-sheet > svg")).toHaveLength(1);
    }
    expect(document.querySelectorAll(".print-all-logs > *")).toHaveLength(tripPlanFixture.daily_logs.length);
    window.dispatchEvent(new Event("afterprint"));
    await waitFor(() => expect(document.querySelectorAll(".print-log-page")).toHaveLength(0));
  });

  it("hides the retired synthetic trip-complete remark in cached plans", async () => {
    const user = userEvent.setup();
    const finalLog = tripPlanFixture.daily_logs.at(-1)!;
    const legacyFinalLog = {
      ...finalLog,
      remarks: [
        ...finalLog.remarks,
        {
          event_id: "trip-complete",
          time: "05:07",
          minute: 307.834,
          status: "off_duty" as const,
          location: "Dallas, TX",
          activity: "Trip complete",
          note: "Trip complete; Off Duty.",
        },
      ],
    };
    renderLogs({
      ...tripPlanFixture,
      daily_logs: [...tripPlanFixture.daily_logs.slice(0, -1), legacyFinalLog],
    });

    await user.click(await screen.findByRole("tab", { name: /Aug 27 · Day 3/ }));

    expect(screen.queryByText(/Trip complete/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Drop-off/i).length).toBeGreaterThan(0);
    expect(screen.getByText(`${finalLog.remarks.length} entries`)).toBeInTheDocument();
  });

  it("supports arrow, Home, and End keyboard navigation between day tabs", async () => {
    const user = userEvent.setup();
    renderLogs();
    const firstTab = await screen.findByRole("tab", { name: /Aug 25 · Day 1/ });
    const secondTab = screen.getByRole("tab", { name: /Aug 26 · Day 2/ });
    const lastTab = screen.getByRole("tab", { name: /Aug 27 · Day 3/ });

    firstTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(secondTab).toHaveFocus();
    expect(secondTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(firstTab).toHaveFocus();
    expect(firstTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(lastTab).toHaveFocus();
    expect(lastTab).toHaveAttribute("aria-selected", "true");
  });

  it("preserves long unbroken metadata on screen and still prints one sheet per day", async () => {
    const longOffice = `OFFICE-${"X".repeat(193)}`;
    const longTerminal = `TERMINAL-${"Y".repeat(191)}`;
    const longMetadata = {
      driver_name: "D".repeat(120),
      carrier_name: "C".repeat(160),
      main_office_address: longOffice,
      home_terminal_address: longTerminal,
      vehicle_number: "V".repeat(80),
      shipping_document_number: "S".repeat(100),
    };
    renderLogs({
      ...tripPlanFixture,
      metadata: longMetadata,
      request: {
        ...tripPlanFixture.request!,
        metadata: longMetadata,
      },
      daily_logs: tripPlanFixture.daily_logs,
    });

    const metadataSection = (await screen.findByRole("heading", { name: "Driver, carrier & document details" })).closest("section");
    expect(within(metadataSection as HTMLElement).getByText(longOffice)).toBeInTheDocument();
    expect(within(metadataSection as HTMLElement).getByText(longTerminal)).toBeInTheDocument();
    expect(document.querySelectorAll(".print-log-page")).toHaveLength(0);
    window.dispatchEvent(new Event("beforeprint"));
    expect(document.querySelectorAll(".print-log-page")).toHaveLength(tripPlanFixture.daily_logs.length);
    expect(document.querySelectorAll(".print-all-logs > *")).toHaveLength(tripPlanFixture.daily_logs.length);
    for (const page of document.querySelectorAll(".print-log-page")) {
      expect(page.querySelectorAll(":scope > .log-sheet > svg")).toHaveLength(1);
    }
  });

  it("explains DST projection and distinguishes repeated fall-back clock times", async () => {
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

    const gridNoteRegion = await screen.findByRole("note", { name: "Daylight-saving time-grid note" });
    expect(gridNoteRegion).toHaveTextContent(gridNote);
    const remarksSection = screen.getByRole("heading", { name: "Duty-status remarks" }).closest("section");
    expect(within(remarksSection as HTMLElement).getByText("01:30 EDT")).toBeInTheDocument();
    expect(within(remarksSection as HTMLElement).getByText("01:30 EST")).toBeInTheDocument();

    expect(document.querySelectorAll(".print-log-page")).toHaveLength(0);
  });
});
