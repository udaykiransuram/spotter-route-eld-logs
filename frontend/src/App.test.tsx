import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PlanProvider, planStorageKey } from "./state/plan-store";
import { tripPlanFixture } from "./test/fixture";

vi.mock("./components/RouteMap", () => ({
  default: () => <div aria-label="Truck route map with scheduled stops">Route map</div>,
}));

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PlanProvider><App /></PlanProvider>
    </MemoryRouter>,
  );
}

describe("Spotter application", () => {
  it("shows the corrected assessment copy and four primary inputs", () => {
    renderApp();
    expect(screen.getByText("Route & ELD Logs")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter trip details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current location")).toHaveValue("Richmond, VA");
    expect(screen.getByLabelText("Pickup location")).toHaveValue("Nashville, TN");
    expect(screen.getByLabelText("Drop-off location")).toHaveValue("Dallas, TX");
    expect(screen.getByLabelText("Current cycle used (hours)")).toHaveValue(30);
    expect(screen.getByRole("button", { name: "Generate route & logs" })).toBeInTheDocument();
  });

  it("validates the cycle range before sending a request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    const cycle = screen.getByLabelText("Current cycle used (hours)");
    await user.clear(cycle);
    await user.type(cycle, "70.25");
    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));

    expect(screen.getByRole("alert")).toHaveTextContent("0 to 70 hours");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generates and persists a route, then exposes route instructions and logs", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => tripPlanFixture,
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));
    expect(await screen.findByText("1,350 mi")).toBeInTheDocument();
    expect(screen.getByText("24h 30m")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View daily logs \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Turn-by-turn route instructions \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("Property-carrying driver")).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.current_location).toMatchObject({ label: "Richmond, VA", lat: 37.5407, lon: -77.436 });
    expect(body.current_cycle_used_hours).toBe(30);
    expect(body.home_terminal_timezone).toBe("America/New_York");
    expect(JSON.parse(sessionStorage.getItem(planStorageKey) ?? "{}")).toMatchObject({ version: 1, plan: { id: "plan-1" } });
  });

  it("keeps an existing result visible when regeneration fails", async () => {
    sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan: tripPlanFixture }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "provider_unavailable", message: "Routing is temporarily unavailable.", field: null, retryable: true } }),
    }));
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByText("1,350 mi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Routing is temporarily unavailable");
    expect(screen.getByText("1,350 mi")).toBeInTheDocument();
  });

  it("redirects a direct logs visit without a stored plan", async () => {
    renderApp("/logs");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Enter trip details" })).toBeInTheDocument());
  });
});
