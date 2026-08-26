import type {
  ApiErrorBody,
  LocationValue,
  TripPlan,
  TripPlanRequest,
} from "../types";
import { isLocationValue, isTripPlan } from "../lib/plan-contract";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const fallbackBaseUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
const API_BASE_URL = (configuredBaseUrl || fallbackBaseUrl).replace(/\/$/, "");
const SUGGESTION_CACHE_TTL_MS = 5 * 60 * 1000;
const SUGGESTION_CACHE_LIMIT = 40;
const API_PRECONNECT_ATTRIBUTE = "data-spotter-api-preconnect";

interface SuggestionCacheEntry {
  expiresAt: number;
  suggestions: LocationValue[];
}

const suggestionCache = new Map<string, SuggestionCacheEntry>();

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is required outside local development.");
}

export class ApiError extends Error {
  readonly code: string;
  readonly field: string | null;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    message: string,
    options: { code: string; field?: string | null; retryable?: boolean; status: number },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.field = options.field ?? null;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

async function readError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | undefined;
  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    body = undefined;
  }

  const error = body?.error;
  const fallback = response.status === 429
    ? "The route service is busy. Please wait a moment and try again."
    : "We could not generate this route. Please try again.";

  return new ApiError(error?.message || fallback, {
    code: error?.code || `http_${response.status}`,
    field: error?.field,
    retryable: error?.retryable ?? (response.status >= 500 || response.status === 429),
    status: response.status,
  });
}

function invalidResponseError() {
  return new ApiError("The route service returned an incomplete response. Please try again.", {
    code: "invalid_response",
    retryable: true,
    status: 502,
  });
}

export function prepareApiConnection() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (document.head.querySelector(`link[${API_PRECONNECT_ATTRIBUTE}]`)) return;

  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = new URL(API_BASE_URL, window.location.href).origin;
  link.crossOrigin = "anonymous";
  link.setAttribute(API_PRECONNECT_ATTRIBUTE, "true");
  document.head.append(link);
}

export function readCachedLocationSuggestions(query: string): LocationValue[] | null {
  const cacheKey = query.trim().toLocaleLowerCase();
  const cached = suggestionCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    suggestionCache.delete(cacheKey);
    return null;
  }

  suggestionCache.delete(cacheKey);
  suggestionCache.set(cacheKey, cached);
  return cached.suggestions;
}

export async function suggestLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationValue[]> {
  if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
  const cacheKey = query.trim().toLocaleLowerCase();
  const cached = readCachedLocationSuggestions(cacheKey);
  if (cached) return cached;

  const response = await fetch(
    `${API_BASE_URL}/api/v1/locations/suggest?q=${encodeURIComponent(query)}`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw await readError(response);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponseError();
  }
  const suggestions = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "suggestions" in payload
      ? payload.suggestions
      : null;
  if (!Array.isArray(suggestions) || !suggestions.every(isLocationValue)) {
    throw invalidResponseError();
  }
  if (suggestionCache.size >= SUGGESTION_CACHE_LIMIT) {
    const oldestKey = suggestionCache.keys().next().value;
    if (oldestKey !== undefined) suggestionCache.delete(oldestKey);
  }
  suggestionCache.set(cacheKey, {
    expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    suggestions,
  });
  return suggestions;
}

export async function generateTripPlan(
  request: TripPlanRequest,
  signal?: AbortSignal,
): Promise<TripPlan> {
  const response = await fetch(`${API_BASE_URL}/api/v1/trip-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw await readError(response);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!isTripPlan(payload)) {
    throw invalidResponseError();
  }
  const plan = payload;
  return { ...plan, request };
}
