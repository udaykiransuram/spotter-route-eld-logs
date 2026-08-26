import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PlanProvider } from "./state/plan-store";
import { planStorageKey } from "./state/plan-storage";
import { tripPlanFixture } from "./test/fixture";
import { formatHours, formatMiles } from "./lib/format";

const fixtureDistance = formatMiles(tripPlanFixture.summary.distance_miles);

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
    expect(screen.getByRole("banner")).toHaveClass("app-header--landing");
    expect(screen.getByText("Route & ELD Logs")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter trip details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current location")).toHaveValue("Richmond, VA");
    expect(screen.getByLabelText("Pickup location")).toHaveValue("Nashville, TN");
    expect(screen.getByLabelText("Drop-off location")).toHaveValue("Dallas, TX");
    expect(screen.getByLabelText("Current cycle used (hours)")).toHaveValue(30);
    const generateButton = screen.getByRole("button", { name: "Generate route & logs" });
    expect(screen.getAllByRole("button", { name: "Generate route & logs" })).toHaveLength(1);
    expect(generateButton.closest("form")).toBeInstanceOf(HTMLFormElement);
    expect(screen.getByRole("button", { name: "Trip & log settings" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByLabelText("Plan start")).not.toBeInTheDocument();
  });

  it("prepares route assets when the preview submit button is hovered", () => {
    document.head
      .querySelectorAll('link[rel="preconnect"][href="https://tiles.openfreemap.org"]')
      .forEach((link) => link.remove());
    renderApp();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Generate route & logs" }));

    expect(document.head.querySelector(
      'link[rel="preconnect"][href="https://tiles.openfreemap.org"]',
    )).toBeInTheDocument();
  });

  it("keeps the landing guidance visible while form drafts change without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApp();

    const guidance = screen.getByRole("region", {
      name: "Your route, stops, and logs in one view",
    });
    const mapPreview = within(guidance).getByRole("group", { name: "Live route preview" });
    const plannedLocations = within(mapPreview).getByRole("list", {
      name: "Planned route locations",
    });
    expect(within(guidance).getByText("Select all three locations.")).toBeInTheDocument();
    expect(plannedLocations).toHaveTextContent("Richmond, VA");
    expect(plannedLocations).toHaveTextContent("Nashville, TN");
    expect(plannedLocations).toHaveTextContent("Dallas, TX");

    await user.clear(screen.getByLabelText("Current location"));
    expect(screen.getByLabelText("Current location")).toHaveValue("");
    expect(plannedLocations).toHaveTextContent("Select current location");

    const cycle = screen.getByLabelText("Current cycle used (hours)");
    await user.clear(cycle);
    await user.type(cycle, "20.5");
    expect(cycle).toHaveValue(20.5);

    await user.click(screen.getByRole("button", { name: "Trip & log settings" }));
    fireEvent.change(screen.getByLabelText("Plan start"), {
      target: { value: "2026-08-25T06:30" },
    });
    await user.type(screen.getByLabelText("Home-terminal timezone"), "America/Chicago");
    await user.type(screen.getByLabelText("Driver"), "Alex Driver");

    expect(screen.getByLabelText("Plan start")).toHaveValue("2026-08-25T06:30");
    expect(screen.getByLabelText("Home-terminal timezone")).toHaveValue("America/Chicago");
    expect(screen.getByLabelText("Driver")).toHaveValue("Alex Driver");
    expect(plannedLocations).toHaveTextContent("Nashville, TN");
    expect(plannedLocations).toHaveTextContent("Dallas, TX");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves departure and timezone on automatic defaults and matches backend metadata limits", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Trip & log settings" }));
    const optionalSettings = screen.getByRole("region", { name: "Trip & log settings" });
    expect(within(optionalSettings).getByText(/Leave plan start blank to begin at the current time/)).toBeInTheDocument();
    expect(screen.getByLabelText("Driver")).toHaveAttribute("maxlength", "120");
    expect(screen.getByLabelText("Carrier")).toHaveAttribute("maxlength", "160");
    expect(screen.getByLabelText("Vehicle identifiers")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Vehicle identifiers")).toHaveAccessibleDescription("Truck, tractor, trailer, or plate number(s).");
    expect(screen.getByLabelText("Shipping details")).toHaveAttribute("maxlength", "100");
    expect(screen.getByLabelText("Shipping details")).toHaveAccessibleDescription("Document number, shipper, or commodity.");
    expect(screen.getByText("Leave plan start blank to begin at the current time. The pre-trip starts then when cycle time is available; otherwise the required restart begins first. Leave timezone blank to detect it from Current location. The remaining details fill the paper logs.")).toBeInTheDocument();
    const departure = screen.getByLabelText("Plan start") as HTMLInputElement;
    expect(departure).toHaveValue("");
    expect(departure).toHaveAccessibleDescription("The schedule begins at this time; a required cycle restart may come before the pre-trip.");
    expect(screen.getByLabelText("Home-terminal timezone")).toHaveValue("");
    expect(screen.getByLabelText("Home-terminal timezone")).toHaveAttribute("placeholder", "Optional override, e.g. America/Chicago");
    expect(screen.getByLabelText("Home-terminal timezone")).toHaveAccessibleDescription("Uses Current location above—not your device GPS. This timezone controls duty start and all daily-log times.");
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByLabelText("Home-terminal timezone")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Main office address")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Home terminal address")).toHaveAttribute("maxlength", "200");
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

  it("shows an accessible route-building view until generation completes", async () => {
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(responsePromise));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));

    const loadingStatus = await screen.findByRole("status");
    expect(loadingStatus).toHaveTextContent("Building your route & logs");
    expect(loadingStatus).toHaveTextContent("This can take up to a minute.");
    expect(screen.getByRole("banner")).not.toHaveClass("app-header--landing");
    const loadingButton = screen.getByRole("button", { name: "Generating route…" });
    expect(screen.getAllByRole("button", { name: "Generating route…" })).toHaveLength(1);
    expect(loadingButton).toBeDisabled();
    expect(loadingButton.closest("form")).toHaveAttribute("aria-busy", "true");

    resolveResponse({
      ok: true,
      status: 200,
      json: async () => tripPlanFixture,
    } as Response);

    expect(await screen.findByText(fixtureDistance)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Building your route & logs")).not.toBeInTheDocument());
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
    expect(await screen.findByText(fixtureDistance)).toBeInTheDocument();
    expect(screen.getByRole("banner")).not.toHaveClass("app-header--landing");
    expect(screen.getByText(formatHours(tripPlanFixture.summary.driving_hours))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(`View daily logs \\(${tripPlanFixture.daily_logs.length}\\)`) })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Turn-by-turn route instructions \\(${tripPlanFixture.instructions.length}\\)`))).toBeInTheDocument();
    const regenerateButton = screen.getByRole("button", { name: "Generate route & logs" });
    expect(screen.getAllByRole("button", { name: "Generate route & logs" })).toHaveLength(1);
    expect(regenerateButton.closest("form")).toBeInstanceOf(HTMLFormElement);
    expect(regenerateButton).not.toHaveAttribute("form");
    expect(screen.queryByText(tripPlanFixture.instructions[0].instruction)).not.toBeInTheDocument();
    await user.click(screen.getByText(new RegExp(`Turn-by-turn route instructions \\(${tripPlanFixture.instructions.length}\\)`)));
    expect(screen.getByText(tripPlanFixture.instructions[0].instruction)).toBeInTheDocument();
    const planBasis = screen.getByRole("region", { name: "Plan basis" });
    expect(within(planBasis).getByText(tripPlanFixture.assumptions[0])).toBeInTheDocument();
    expect(within(planBasis).getByText(`${tripPlanFixture.assumptions.length} assumptions`)).toBeInTheDocument();
    expect(within(planBasis).getByText(`${tripPlanFixture.warnings.length} warnings`)).toBeInTheDocument();
    expect(within(planBasis).getByText("Assessment assumptions")).toBeInTheDocument();
    expect(within(planBasis).getByText("Planning model choices")).toBeInTheDocument();
    expect(within(planBasis).getByText("Important limitations")).toBeInTheDocument();
    expect(within(planBasis).getByText(tripPlanFixture.notice)).toBeInTheDocument();
    expect(planBasis.querySelectorAll(".assumptions__item--assumption")).toHaveLength(
      tripPlanFixture.assumptions.length,
    );
    expect(within(planBasis).getAllByRole("note")).toHaveLength(tripPlanFixture.warnings.length);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.current_location).toMatchObject({ label: "Richmond, VA", lat: 37.5407, lon: -77.436 });
    expect(body.current_cycle_used_hours).toBe(30);
    expect(body).not.toHaveProperty("departure_at");
    expect(body).not.toHaveProperty("home_terminal_timezone");
    expect(JSON.parse(sessionStorage.getItem(planStorageKey) ?? "{}")).toMatchObject({ version: 1, plan: { id: "plan-1" } });
  });

  it("trims and submits optional paper-log metadata", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => tripPlanFixture,
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp();

    await user.click(screen.getByRole("button", { name: "Trip & log settings" }));
    await user.type(screen.getByLabelText("Main office address"), "  123 Dispatch Way  ");
    await user.type(screen.getByLabelText("Home terminal address"), "  880 Terminal Road  ");
    await user.type(screen.getByLabelText("Vehicle identifiers"), "  Tractor 18 / Trailer 42  ");
    await user.type(screen.getByLabelText("Shipping details"), "  BOL 547 / Produce  ");
    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));
    await screen.findByText(fixtureDistance);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.metadata).toMatchObject({
      main_office_address: "123 Dispatch Way",
      home_terminal_address: "880 Terminal Road",
      vehicle_number: "Tractor 18 / Trailer 42",
      shipping_document_number: "BOL 547 / Produce",
    });
  });

  it("keeps an existing result visible when regeneration fails", async () => {
    sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan: tripPlanFixture }));
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(responsePromise));
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(fixtureDistance)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Updating route & logs…");
    expect(screen.getByText(fixtureDistance)).toBeInTheDocument();

    resolveResponse({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "provider_unavailable", message: "Routing is temporarily unavailable.", field: null, retryable: true } }),
    } as Response);

    expect(await screen.findByText("Routing is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Updating route & logs…")).not.toBeInTheDocument();
    expect(screen.getByText(fixtureDistance)).toBeInTheDocument();
  });

  it("clears a generated route and its stored logs when an input changes", async () => {
    sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan: tripPlanFixture }));
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByText(fixtureDistance)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Current cycle used (hours)"));

    expect(screen.queryByText(fixtureDistance)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your route, stops, and logs in one view" })).toBeInTheDocument();
    expect(sessionStorage.getItem(planStorageKey)).toBeNull();
  });

  it("clears a route API error as soon as the form changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "provider_unavailable", message: "Routing is temporarily unavailable.", field: null, retryable: true } }),
    }));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));
    expect(await screen.findByText("Routing is temporarily unavailable.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Current cycle used (hours)"));

    expect(screen.queryByText("Routing is temporarily unavailable.")).not.toBeInTheDocument();
  });

  it("restores the form values that produced a saved route", async () => {
    sessionStorage.setItem(planStorageKey, JSON.stringify({
      version: 1,
      plan: {
        ...tripPlanFixture,
        request: {
          ...tripPlanFixture.request!,
          current_location: {
            id: "boston",
            label: "Boston, MA",
            lat: 42.3601,
            lon: -71.0589,
          },
          current_cycle_used_hours: 12.5,
        },
      },
    }));
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByLabelText("Current location")).toHaveValue("Boston, MA");
    expect(screen.getByLabelText("Current cycle used (hours)")).toHaveValue(12.5);
    await user.click(screen.getByRole("button", { name: "Trip & log settings" }));
    expect(screen.getByLabelText("Driver")).toHaveValue("Alex Driver");
    expect(screen.getByLabelText("Plan start")).toHaveValue("2026-08-25T06:00");
    expect(screen.getByLabelText("Home-terminal timezone")).toHaveValue("America/New_York");
  });

  it("removes a stored plan with malformed nested log data and recovers on the route form", async () => {
    const malformedPlan = {
      ...tripPlanFixture,
      daily_logs: [
        {
          ...tripPlanFixture.daily_logs[0],
          status_totals: {
            ...tripPlanFixture.daily_logs[0].status_totals,
            driving: "8.5",
          },
        },
        tripPlanFixture.daily_logs[1],
      ],
    };
    sessionStorage.setItem(planStorageKey, JSON.stringify({ version: 1, plan: malformedPlan }));

    renderApp("/logs");

    expect(await screen.findByRole("heading", { name: "Enter trip details" })).toBeInTheDocument();
    expect(sessionStorage.getItem(planStorageKey)).toBeNull();
  });

  it("redirects a direct logs visit without a stored plan", async () => {
    renderApp("/logs");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Enter trip details" })).toBeInTheDocument());
  });
});
