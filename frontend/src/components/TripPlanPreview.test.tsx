import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TripFormDraft } from "./TripForm";
import { TripPlanPreview, TripRouteArtwork } from "./TripPlanPreview";

const completeDraft: TripFormDraft = {
  current: {
    id: "richmond",
    label: "Richmond, VA",
    lat: 37.5407,
    lon: -77.436,
  },
  pickup: {
    id: "nashville",
    label: "Nashville, TN",
    lat: 36.1627,
    lon: -86.7816,
  },
  dropoff: {
    id: "dallas",
    label: "Dallas, TX",
    lat: 32.7767,
    lon: -96.797,
  },
  cycleUsedHours: "17.5",
  departureAt: "2026-08-25T06:30",
  timezone: "America/New_York",
  metadata: {
    driver_name: "Alex Driver",
    carrier_name: "Spotter Freight",
    main_office_address: "123 Dispatch Way",
    home_terminal_address: "880 Terminal Road",
    vehicle_number: "Tractor 18 / Trailer 42",
    shipping_document_number: "BOL 547 / Produce",
  },
};

describe("TripPlanPreview", () => {
  it("renders the route artwork by itself for the landing map card", () => {
    const { container } = render(<TripRouteArtwork draft={completeDraft} standalone />);

    const artwork = screen.getByRole("group", { name: "Live route preview" });
    const stops = within(artwork).getByRole("list", { name: "Planned route locations" });

    expect(stops).toHaveTextContent("Richmond, VA");
    expect(stops).toHaveTextContent("Nashville, TN");
    expect(stops).toHaveTextContent("Dallas, TX");
    expect(container.querySelector(".trip-preview__route-line-path")).toHaveAttribute(
      "d",
      "M64 82 C144 32 205 37 270 81 S417 134 576 62",
    );
    expect(screen.queryByRole("heading", { name: "Trip details" })).not.toBeInTheDocument();
  });

  it("renders the compact curved-route preview with complete empty-state fallbacks", () => {
    const { container } = render(<TripPlanPreview />);

    const preview = screen.getByRole("group", { name: "Trip plan preview" });
    const stops = within(preview).getByRole("list", { name: "Planned route locations" });
    const paperDetails = within(preview).getByRole("region", { name: "Paper log details" });

    expect(within(preview).getByText("Live route preview")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "Trip details" })).toBeInTheDocument();
    expect(stops).toHaveTextContent("Select current location");
    expect(stops).toHaveTextContent("Select pickup location");
    expect(stops).toHaveTextContent("Select drop-off location");
    expect(within(preview).getByText("Enter used cycle hours")).toBeInTheDocument();
    expect(within(preview).getByText("Starts when generated")).toBeInTheDocument();
    expect(within(preview).getByText("Select current location to detect")).toBeInTheDocument();
    expect(within(paperDetails).getByText("0/6 added")).toBeInTheDocument();
    expect(within(paperDetails).getAllByText("Not added")).toHaveLength(6);

    const routeSvg = container.querySelector(".trip-preview__route-line");
    expect(routeSvg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(routeSvg).toHaveAttribute("width", "640");
    expect(routeSvg).toHaveAttribute("height", "144");
    expect(routeSvg?.querySelector(".trip-preview__route-line-path")).toHaveAttribute(
      "d",
      "M64 82 C144 32 205 37 270 81 S417 134 576 62",
    );
  });

  it("renders live cycle, route, schedule, timezone, and every paper-log field", () => {
    render(<TripPlanPreview draft={completeDraft} />);

    const preview = screen.getByRole("group", { name: "Trip plan preview" });
    const stops = within(preview).getByRole("list", { name: "Planned route locations" });
    const paperDetails = within(preview).getByRole("region", { name: "Paper log details" });

    expect(within(preview).getByText("Estimated 52.5h remaining")).toBeInTheDocument();
    expect(stops).toHaveTextContent("Richmond, VA");
    expect(stops).toHaveTextContent("Nashville, TN");
    expect(stops).toHaveTextContent("Dallas, TX");
    expect(within(preview).getByText("Aug 25, 2026, 6:30 AM")).toBeInTheDocument();
    expect(within(preview).getByText("America/New_York")).toBeInTheDocument();
    expect(within(paperDetails).getByText("6/6 added")).toBeInTheDocument();

    for (const value of Object.values(completeDraft.metadata)) {
      expect(within(paperDetails).getByText(value!)).toBeInTheDocument();
    }
  });

  it("does not present an invalid cycle value as remaining hours", () => {
    render(<TripPlanPreview draft={{ ...completeDraft, cycleUsedHours: "71" }} />);

    expect(screen.getByText("Enter 0–70 used hours")).toBeInTheDocument();
    expect(screen.queryByText(/Estimated .* remaining/)).not.toBeInTheDocument();
  });
});
