import { describe, expect, it, vi } from "vitest";
import { generateTripPlan, suggestLocations } from "./client";
import { tripPlanFixture } from "../test/fixture";

describe("API client", () => {
  it("reads the suggestions envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ id: "1", label: "Dallas, TX", lat: 32.77, lon: -96.79 }] }),
    }));
    await expect(suggestLocations("Dallas, TX")).resolves.toEqual([
      { id: "1", label: "Dallas, TX", lat: 32.77, lon: -96.79 },
    ]);
  });

  it("posts the typed request and attaches it to the returned plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => tripPlanFixture });
    vi.stubGlobal("fetch", fetchMock);
    const request = tripPlanFixture.request!;
    const plan = await generateTripPlan(request);
    expect(plan.request).toEqual(request);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/trip-plans"), expect.objectContaining({ method: "POST" }));
  });

  it("preserves the backend error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: "quota_exceeded", message: "Daily routing quota reached.", field: null, retryable: true } }),
    }));
    await expect(suggestLocations("Dallas")).rejects.toMatchObject({
      code: "quota_exceeded",
      message: "Daily routing quota reached.",
      retryable: true,
      status: 429,
    });
  });
});
