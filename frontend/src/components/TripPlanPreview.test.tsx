import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripPlanPreview } from "./TripPlanPreview";

describe("TripPlanPreview", () => {
  it("labels the preview and describes its generic route flow", () => {
    render(<TripPlanPreview />);

    const preview = screen.getByRole("group", { name: "Trip plan preview" });
    const stops = screen.getByRole("list", { name: "Example route stops" });

    expect(preview).toBeInTheDocument();
    expect(stops).toHaveTextContent("Current location");
    expect(stops).toHaveTextContent("Pickup");
    expect(stops).toHaveTextContent("Drop-off");
  });

  it("lists the exact generated trip outcomes", () => {
    render(<TripPlanPreview />);

    expect(screen.getByRole("heading", { name: "What you'll get" })).toBeInTheDocument();
    expect(screen.getByText("Road-level path and trip totals")).toBeInTheDocument();
    expect(screen.getByText("Breaks, rest, fuel, pickup, and drop-off")).toBeInTheDocument();
    expect(screen.getByText("One log sheet for each trip day")).toBeInTheDocument();
  });
});
