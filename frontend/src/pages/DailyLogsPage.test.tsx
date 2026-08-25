import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { PlanProvider, planStorageKey } from "../state/plan-store";
import { tripPlanFixture } from "../test/fixture";

function renderLogs() {
  sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan: tripPlanFixture }));
  return render(<MemoryRouter initialEntries={["/logs"]}><PlanProvider><App /></PlanProvider></MemoryRouter>);
}

describe("Daily logs page", () => {
  it("switches day tabs and keeps summaries and remarks readable", async () => {
    const user = userEvent.setup();
    renderLogs();

    expect(screen.getByRole("heading", { name: "Daily logs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Aug 25 · Day 1/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("490 mi")).toBeInTheDocument();
    expect(screen.getByText("Generated trip plan — not a certified ELD record.")).toBeInTheDocument();
    expect(screen.getAllByText(/Off duty → Driving/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: /Aug 26 · Day 2/ }));
    expect(screen.getByRole("tab", { name: /Aug 26 · Day 2/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("860 mi")).toBeInTheDocument();
    expect(screen.getByText("13.50 h")).toBeInTheDocument();
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
  });
});
