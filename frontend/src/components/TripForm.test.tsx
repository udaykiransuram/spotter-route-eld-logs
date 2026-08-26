import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { tripPlanFixture } from "../test/fixture";
import type { TripPlanRequest } from "../types";
import { TripForm } from "./TripForm";

const baseRequest = tripPlanFixture.request!;

const duplicateCases: Array<{
  name: string;
  request: TripPlanRequest;
  fieldLabel: string;
  message: string;
}> = [
  {
    name: "current and pickup",
    request: {
      ...baseRequest,
      pickup_location: {
        ...baseRequest.current_location,
        id: "duplicate-pickup",
        label: "Same pickup",
      },
    },
    fieldLabel: "Pickup location",
    message: "Pickup location must differ from current location.",
  },
  {
    name: "current and drop-off",
    request: {
      ...baseRequest,
      dropoff_location: {
        ...baseRequest.current_location,
        id: "duplicate-dropoff-current",
        label: "Same drop-off",
      },
    },
    fieldLabel: "Drop-off location",
    message: "Drop-off location must differ from current location.",
  },
  {
    name: "pickup and drop-off",
    request: {
      ...baseRequest,
      dropoff_location: {
        ...baseRequest.pickup_location,
        id: "duplicate-dropoff-pickup",
        label: "Same drop-off",
      },
    },
    fieldLabel: "Drop-off location",
    message: "Drop-off location must differ from pickup location.",
  },
];

describe("TripForm", () => {
  it.each(duplicateCases)("rejects duplicate coordinates for $name", async ({
    request,
    fieldLabel,
    message,
  }) => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <TripForm
        initialRequest={request}
        loading={false}
        onFormChange={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate route & logs" }));

    expect(screen.getByLabelText(fieldLabel)).toHaveAccessibleDescription(message);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
