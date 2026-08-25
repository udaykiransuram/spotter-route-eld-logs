# Route & ELD Logs

A stateless Django and React assessment app that builds a heavy-truck route from the driver's current location through pickup to drop-off, schedules fuel/break/rest events under the stated property-carrying HOS assumptions, and renders one filled paper-style daily log for every calendar day touched by the trip.

> Generated trip plan — not a certified ELD record.

## What is included

- React 19, TypeScript, and Vite frontend with `/` route results and `/logs` daily logs.
- Django REST Framework API with no database, authentication, history, or admin surface.
- Geoapify adapter for US autocomplete, `heavy_truck` routing, reverse geocoding/timezone lookup, and nearby fuel stations.
- Deterministic demo routing when no Geoapify key is configured, so reviewers can run the complete flow offline.
- MapLibre with the OpenFreeMap Liberty style and visible provider attribution.
- One canonical `DutyEvent` sequence used by the stops, itinerary, summary, and daily log projections.
- SVG overlays on the supplied `blank-paper-log.png`, plus fullscreen and print/PDF controls.

## Screenshots

### Route, stops, and HOS itinerary

![Generated route with summary, map, scheduled stops, and assumptions](docs/screenshots/route-results.png)

### Filled daily log

![Filled daily driver log with totals, remarks, and log controls](docs/screenshots/daily-logs.png)

## Run locally

Requirements: Python 3.12+, Node 22+, and pnpm 11.

Install and start the API:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

The API uses its deterministic demo provider by default. To use real road routing, export a Geoapify key before starting it:

```bash
export GEOAPIFY_API_KEY="your-key"
export USE_DEMO_PROVIDER="false"
backend/.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

In another terminal, install and start the frontend:

```bash
pnpm install
pnpm --filter frontend dev
```

Open `http://127.0.0.1:5173`. The frontend defaults to `http://127.0.0.1:8000`; override it with `VITE_API_BASE_URL`.

## Sample trip

The form starts with a review-ready example:

- Current location: Richmond, VA
- Pickup: Nashville, TN
- Drop-off: Dallas, TX
- Current cycle used: 30 hours

Select an autocomplete result for each location, then choose **Generate route & logs**. The deterministic route is intentionally long enough to demonstrate breaks, a 10-hour rest, a fuel stop, multiple dates, and filled daily sheets.

## Architecture

```text
frontend (React/Vite)
  location autocomplete ───────────────┐
  route map + itinerary                │ JSON
  daily SVG log sheets                 │
  sessionStorage (last result only)    ▼
backend (Django REST Framework)
  request validation → routing provider → pure HOS scheduler
                                      → daily-log projection
  Geoapify provider or deterministic demo provider
```

The API stays stateless. The browser stores only the last successful response in versioned `sessionStorage`, allowing `/logs` to survive an in-tab refresh without creating trip history.

## API

### `GET /api/v1/health`

Returns service health and the active provider (`demo` or `geoapify`).

### `GET /api/v1/locations/suggest?q=...`

Returns US location candidates as `{ id, label, city, state, country, lat, lon }`. A typed value is not accepted as a waypoint until the user chooses an unambiguous candidate.

### `POST /api/v1/trip-plans`

Request:

```json
{
  "current_location": {"id": "...", "label": "Chicago, IL, USA", "lat": 41.8781, "lon": -87.6298},
  "pickup_location": {"id": "...", "label": "Nashville, TN, USA", "lat": 36.1627, "lon": -86.7816},
  "dropoff_location": {"id": "...", "label": "Dallas, TX, USA", "lat": 32.7767, "lon": -96.797},
  "current_cycle_used_hours": 24,
  "departure_at": "2026-08-25T06:00:00",
  "home_terminal_timezone": "America/Chicago",
  "metadata": {
    "driver_name": "",
    "carrier_name": "",
    "vehicle_number": "",
    "shipping_document_number": ""
  }
}
```

The response contains route GeoJSON, turn-by-turn instructions, summary totals, scheduled stops, chronological duty events, daily logs, metadata, assumptions, warnings, the non-certified-record notice, and attribution.

Errors use one stable envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Current, pickup, and drop-off locations must differ.",
    "field": "dropoff_location",
    "retryable": false
  }
}
```

Provider timeouts, quota failures, unavailable routes, rejected credentials, invalid inputs, and identical waypoints are normalized into this shape.

## HOS model used by this assessment

- The driver begins after 10 consecutive hours off duty with fresh 11-hour and 14-hour clocks.
- Driving is capped at 11 hours and never begins or continues beyond the 14-hour window.
- A 30-minute non-driving interruption is inserted after eight cumulative driving hours; pickup, drop-off, or fueling also satisfy it when they occur in time.
- Pickup and drop-off are exactly one hour of On Duty—not driving.
- Fuel is targeted at 950 miles, keeping every fuel interval below 1,000 miles. Fueling is 30 minutes On Duty—not driving.
- The initial cycle balance is `70 - current_cycle_used_hours`. A 34-hour restart is inserted before more driving when it reaches zero.
- A simultaneous cycle and daily reset becomes one 34-hour block.
- Pickup or drop-off work may finish after an arrival at a driving limit because those limits prohibit more driving, not all work.

Split sleeper berth, short-haul exceptions, adverse-condition extensions, team driving, personal conveyance, traffic, and weather are intentionally excluded.

Daily sheets are split at midnight in the home-terminal timezone. Time before departure and after trip completion is Off Duty, active statuses carry through midnight, the four status totals reconcile to 24 hours, and daily mileage reconciles to route mileage.

## Checks

```bash
backend/.venv/bin/ruff check backend
backend/.venv/bin/pytest backend
pnpm --filter frontend lint
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter frontend build
pnpm --filter frontend test:e2e
```

The backend suite covers event ordering/non-overlap, 8/11/14-hour boundaries, pickup/fuel break qualification, 0/near-70/70 cycle inputs, combined resets, multiple fuel intervals, midnight/timezone splitting, mileage and 24-hour invariants, provider failures, and request validation. Frontend tests cover form and result interactions, storage, daily tabs, accessible remarks, and log controls. Playwright runs the complete generation-to-logs flow at desktop and mobile sizes. GitHub Actions runs linting, type checks, both test suites, the production build, and these browser smoke tests.

## Deploy as two Vercel projects

Use this one repository for two projects:

1. **API project** — root directory `backend`; add `GEOAPIFY_API_KEY`, `USE_DEMO_PROVIDER=false`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, and `CORS_ALLOWED_ORIGINS`.
2. **Frontend project** — root directory `frontend`; add `VITE_API_BASE_URL` with the deployed API origin.

Both folders include Vercel routing configuration. Add the final production origins to the backend host/CORS variables before the first end-to-end production check.

- Frontend URL: _add after deployment_
- API URL: _add after deployment_

## Suggested 3–5 minute Loom outline

1. Show the four assessment inputs and collapsed trip/log settings.
2. Generate the sample route and point out summary metrics, numbered map stops, itinerary, directions, assumptions, and warnings.
3. Open a multi-day example and move across date tabs.
4. Show the filled log trace, totals, remarks, fullscreen view, and Print/Save PDF.
5. Briefly show the Django scheduling/projection modules and React page/component structure.
6. End with the automated checks, Vercel configuration, demo-vs-Geoapify behavior, and known limitations.

## Limitations

- This is a planning aid, not an FMCSA-certified ELD, legal opinion, dispatch system, or navigation product.
- The starting cycle value is a simplified scalar; historical eight-day log records are not available, so a full rolling recap cannot be reconstructed.
- Demo mode uses deterministic interpolated geometry and estimated driving speed. Configure Geoapify for road-level truck routes and real place data.
- Fuel lookup finds a nearby station around the planned route point; it does not reroute through station driveways.
- No account, database, saved trip history, collaborative workflow, or server-side PDF archive is included by design.
