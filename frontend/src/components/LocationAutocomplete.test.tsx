import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { suggestLocations } from "../api/client";
import type { LocationValue } from "../types";
import { LocationAutocomplete } from "./LocationAutocomplete";

function Harness() {
  const [value, setValue] = useState<LocationValue | null>(null);
  return <LocationAutocomplete label="Current location" name="current" value={value} onChange={setValue} />;
}

describe("LocationAutocomplete", () => {
  it("waits for three characters and selects a full location with the keyboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [{ id: "aus", label: "Austin, TX", city: "Austin", state: "TX", country: "United States", lat: 30.2672, lon: -97.7431 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Current location" });

    await user.type(input, "Au");
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(input, "s");
    const option = await screen.findByRole("option", { name: /Austin, TX/ });
    expect(option).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=Aus");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Austin, TX");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a recoverable message when location search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "Nowhere");
    expect(await screen.findByText("Location search is unavailable. Try again in a moment.")).toBeInTheDocument();
  });

  it("shows an exact cached search immediately without another request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [{ id: "instant", label: "Instant Cache, TX", lat: 31, lon: -97 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await suggestLocations("Instant Cache Query");
    render(<Harness />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Instant Cache Query" } });

    expect(await screen.findByRole("option", { name: /Instant Cache, TX/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("removes options from an older query while the next search is pending", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [{ id: "zephyr", label: "Zephyr, TX", lat: 31, lon: -97 }],
        }),
      })
      .mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");

    await user.type(input, "Zep");
    expect(await screen.findByRole("option", { name: /Zephyr, TX/ })).toBeInTheDocument();
    await user.type(input, "h");

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /Zephyr, TX/ })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Searching locations")).toBeInTheDocument();
  });
});
