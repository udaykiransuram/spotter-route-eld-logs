import { describe, expect, it, vi } from "vitest";
import {
  generateTripPlan,
  prepareApiConnection,
  readCachedLocationSuggestions,
  suggestLocations,
} from "./client";
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

  it("rejects malformed location suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ label: "Missing coordinates" }] }),
    }));
    await expect(suggestLocations("Dallas")).rejects.toMatchObject({
      code: "invalid_response",
      retryable: true,
      status: 502,
    });
  });

  it("reuses a recent autocomplete result without another network request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ id: "cache-1", label: "Cache Test, TX", lat: 31, lon: -97 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await suggestLocations("Cache Test Place");
    await expect(suggestLocations(" cache test place ")).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("exposes normalized cached suggestions for an immediate UI fast path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ id: "fast-1", label: "Fast Cache, TX", lat: 31, lon: -97 }] }),
    }));

    expect(readCachedLocationSuggestions("Fast Cache Place")).toBeNull();
    await suggestLocations("Fast Cache Place");
    expect(readCachedLocationSuggestions(" fast cache place ")).toEqual([
      { id: "fast-1", label: "Fast Cache, TX", lat: 31, lon: -97 },
    ]);
  });

  it("preconnects to the API origin only once", () => {
    prepareApiConnection();
    prepareApiConnection();
    expect(document.head.querySelectorAll("link[data-spotter-api-preconnect]")).toHaveLength(1);
  });

  it("posts the typed request and attaches it to the returned plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => tripPlanFixture });
    vi.stubGlobal("fetch", fetchMock);
    const request = tripPlanFixture.request!;
    const plan = await generateTripPlan(request);
    expect(plan.request).toEqual(request);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/trip-plans"), expect.objectContaining({ method: "POST" }));
  });

  it("rejects a successful response with malformed nested trip-plan data", async () => {
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => malformedPlan,
    }));

    await expect(generateTripPlan(tripPlanFixture.request!)).rejects.toMatchObject({
      code: "invalid_response",
      message: "The route service returned an incomplete response. Please try again.",
      retryable: true,
      status: 502,
    });
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
