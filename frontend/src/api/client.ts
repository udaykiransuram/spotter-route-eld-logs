import type {
  ApiErrorBody,
  LocationValue,
  TripPlan,
  TripPlanRequest,
} from "../types";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = (configuredBaseUrl || "http://127.0.0.1:8000").replace(/\/$/, "");

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

export async function suggestLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationValue[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/locations/suggest?q=${encodeURIComponent(query)}`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw await readError(response);

  const body = (await response.json()) as { suggestions?: LocationValue[] } | LocationValue[];
  return Array.isArray(body) ? body : body.suggestions ?? [];
}

export async function generateTripPlan(request: TripPlanRequest): Promise<TripPlan> {
  const response = await fetch(`${API_BASE_URL}/api/v1/trip-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await readError(response);

  const plan = (await response.json()) as TripPlan;
  return { ...plan, request };
}
