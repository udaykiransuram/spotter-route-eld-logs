# Route & ELD Logs

A stateless Django and React assessment app that builds a heavy-truck route from the driver's current location through pickup to drop-off, schedules pre-trip/fuel/break/rest events under the stated property-carrying HOS assumptions, and renders one filled paper-style daily log for every calendar day touched by the trip.

> Generated trip plan — not a certified ELD record.

## What is included

- React 19, Material UI, TypeScript, and Vite frontend with `/` route results and `/logs` daily logs.
- Django REST Framework API with no database, authentication, history, or admin surface.
- Geoapify adapter whose live autocomplete requests are explicitly filtered to the United States, plus `heavy_truck` routing, reverse geocoding/timezone lookup, and nearby fuel stations.
- Deterministic demo routing when no Geoapify key is configured, so reviewers can run the complete flow offline.
- MapLibre with a calmly restyled OpenFreeMap Liberty basemap and visible provider attribution.
- Intent-based loading for the route map and log screens, print-only SVG rendering, cached autocomplete results, and bounded concurrent optional stop lookups.
- One canonical `DutyEvent` sequence projected into the stops, itinerary, summary, and daily logs. Log-only pre-trips stay off the map, and the contiguous meal-plus-sleeper pair is represented by one 10-hour geographic rest stop.
- Reverse-geocoded city/state labels shared across adjacent duty events and midnight log continuations, while nearby fuel stations remain suggestions rather than unmodeled route detours.
- A code-native SVG recreation of the supplied paper-log layout, with sharp vector labels, rules, duty traces, fullscreen viewing, and print/PDF controls. The original `blank-paper-log.png` remains only as the visual reference.

## Screenshots

### Route, stops, and HOS itinerary

![Generated route with summary, map, scheduled stops, and assumptions](docs/screenshots/route-results.png)

### Filled daily log

![Filled daily driver log with totals, remarks, and log controls](docs/screenshots/daily-logs.png)

## Submission links

These values are intentionally left as placeholders until the repository, both Vercel projects, and the walkthrough are public and verified. Do not submit with placeholders remaining.

- GitHub repository: **https://github.com/udaykiransuram/spotter-route-eld-logs**
- Deployed frontend: **TODO — add production frontend URL**
- Deployed API: **TODO — add production API URL**
- Loom walkthrough: **TODO — add 3–5 minute recording URL**

## Run locally

Requirements: Python 3.12+, Node 22+, and pnpm 10.34.5. The exact pnpm version is pinned in `package.json` and the lockfile to a release supported by Vercel. Install Playwright's bundled Chromium before the browser smoke test with `pnpm --filter frontend exec playwright install chromium`.

Install and start the API:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
cp .env.example .env
backend/.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

There is one local environment file: `.env` in the project root. It is ignored by Git. The API uses its deterministic demo provider by default. For real road routing, edit the root `.env` and set:

```dotenv
GEOAPIFY_API_KEY=your-key
USE_DEMO_PROVIDER=false
```

Restart the API after changing `.env`. No database setup or migration is required; the API deliberately stores no application data.

In another terminal, install and start the frontend:

```bash
pnpm install
pnpm --filter frontend dev
```

Open `http://127.0.0.1:5173`. Vite development defaults to `http://127.0.0.1:8000`; override it with `VITE_API_BASE_URL` in the same root `.env`. `VITE_API_BASE_URL` is mandatory for every production build and must be the deployed API origin. The production client deliberately has no localhost fallback.

## Sample trip

The form starts with a review-ready example:

- Current location: Richmond, VA
- Pickup: Nashville, TN
- Drop-off: Dallas, TX
- Current cycle used: 30 hours

Keep the selected defaults or search and choose an unambiguous U.S. autocomplete result for each location, then choose **Generate route & logs**. Leaving plan start blank begins the schedule at the current time in the detected home-terminal timezone. The pre-trip begins then when cycle time is available; otherwise the required restart begins first. UTC is used only when timezone detection is unavailable. The deterministic route is intentionally long enough to demonstrate breaks, a one-hour meal/dinner period followed by nine hours in the sleeper berth, a fuel stop, multiple dates, and filled daily sheets.

**Current cycle used** is a capped planning balance for the driver's combined driving and On Duty—not driving hours already consumed in the simplified 70-hour/8-day cycle at plan start. Entering `0` leaves all 70 hours available; enter `70` when the actual total is 70 hours or more, which causes the scheduler to place a 34-hour restart before further driving. This is a starting aggregate, not a reconstruction of the driver's prior eight daily records.

> **Estimated paper-log recap:** Because the form receives only that starting aggregate, the 70-hour/8-day A/B/C recap uses a conservative planning assumption. No starting hours are treated as aging out during the trip: A and C equal the projected cycle hours used at the end of the log day, while B equals `max(0, 70 - A)`. On Duty work can make A/C exceed 70 even though no further driving is allowed. A scheduled 34-hour restart resets the estimate. The unused 60-hour/7-day recap is marked `N/A`. These values estimate the remaining 70-hour balance; they do not reconstruct certified historical logs.

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

### Repository layout

```text
backend/
  config/                 Django settings, URLs, and deployment entrypoints
  trips/
    providers/            Geoapify and deterministic demo adapters
    serializers.py        Request validation and timezone normalization
    scheduler.py          Pure HOS duty-event scheduler
    logs.py               Midnight splitting and daily-log projection
    service.py            Route/provider/scheduler orchestration
    tests/                 API, provider, scheduler, and invariant tests
frontend/
  src/
    api/                   Typed HTTP client and response validation
    components/            Reusable form, map, itinerary, and log UI
    lib/                   Formatting and runtime contract guards
    pages/                 Route and lazy-loaded daily-log screens
    state/                 Versioned sessionStorage plan state
    test/                  Shared deterministic response fixture
  e2e/                     Desktop and mobile Playwright smoke tests
docs/screenshots/          Submission screenshots referenced below
```

## API

### `GET /api/v1/health`

Returns service health, the active provider (`demo` or `geoapify`), and whether that provider is configured. Demo mode returns HTTP `200`. Live mode returns HTTP `200` only when a non-empty `GEOAPIFY_API_KEY` is present; if live mode is selected without a key, it returns HTTP `503` with `status: "not_configured"` and `configured: false`. This is a configuration check, not a paid provider request, so rejected credentials or upstream availability are surfaced when a route or suggestion is requested.

### `GET /api/v1/locations/suggest?q=...`

Returns `{ suggestions, attribution }`. Live Geoapify autocomplete includes `filter=countrycode:us`, so the UI offers U.S. candidates shaped as `{ id, label, city, state, country, lat, lon }`. A typed value is not accepted as a waypoint until the user chooses an unambiguous candidate.

### `POST /api/v1/trip-plans`

Request:

```json
{
  "current_location": {"id": "...", "label": "Chicago, IL, USA", "lat": 41.8781, "lon": -87.6298},
  "pickup_location": {"id": "...", "label": "Nashville, TN, USA", "lat": 36.1627, "lon": -86.7816},
  "dropoff_location": {"id": "...", "label": "Dallas, TX, USA", "lat": 32.7767, "lon": -96.797},
  "current_cycle_used_hours": 24,
  "departure_at": "2026-08-25T06:00:00-04:00",
  "metadata": {
    "driver_name": "",
    "carrier_name": "",
    "main_office_address": "",
    "home_terminal_address": "",
    "vehicle_number": "",
    "shipping_document_number": ""
  }
}
```

The form normally omits `departure_at` and `home_terminal_timezone`, so the API uses the current time in an IANA timezone detected from the starting location. `departure_at` is the plan start. The pre-trip begins then when cycle time is available; a required cycle restart can come first. UTC is the explicit fallback when detection is unavailable. A user may enter a later local plan start or override the timezone. A local time that occurs twice at the end of daylight saving time must include its UTC offset (for example, `-04:00` or `-05:00`) so the intended instant is unambiguous.

The response contains route GeoJSON, turn-by-turn instructions, summary totals, scheduled stops, chronological duty events, daily logs, assumptions, warnings, and attribution. Entered `metadata` and the non-certified-record `notice` are canonical top-level response fields; they are intentionally not duplicated inside every daily-log object. The frontend passes those top-level values into each rendered sheet.

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

Anonymous autocomplete and trip-generation requests have best-effort process-local throttles (`120/minute` and `30/hour` per client respectively). Deployments can tune these with `LOCATION_SUGGEST_RATE` and `TRIP_PLAN_RATE` without adding a database. On serverless hosting, counters are neither durable across cold starts nor shared across instances, so they are not strict quota protection; enforce production limits at the hosting edge or replace the cache with a shared store.

## HOS model used by this assessment

- The driver begins after 10 consecutive hours off duty with fresh 11-hour and 14-hour clocks.
- Every driving shift begins with a 30-minute pre-trip inspection logged On Duty—not driving. The fixed duration is an explicit planning assumption.
- Driving is capped at 11 hours and never begins or continues beyond the 14-hour window.
- A dedicated 30-minute Off Duty meal/rest break is inserted after eight cumulative driving hours; pickup, drop-off, or fueling also satisfy the break rule when they occur in time.
- Pickup and drop-off are exactly one hour of On Duty—not driving.
- Fuel is targeted at 950 miles, keeping every fuel interval below 1,000 miles. Fueling is 30 minutes On Duty—not driving. A station name is shown only when the provider returns one within five straight-line miles; the distance is disclosed and the station is not silently added as a route detour.
- A normal daily rest is one contiguous 10-hour qualifying block: one hour Off Duty for a meal/dinner break followed by nine hours in the Sleeper Berth. The next pre-trip follows that block.
- Meal/rest time qualifies as Off Duty only under the explicit assumption that the driver is relieved of work, vehicle, and cargo responsibility and is free to pursue personal activities. The modeled Sleeper Berth time assumes a vehicle with a compliant sleeper berth.
- The initial cycle balance is `70 - current_cycle_used_hours`. A 34-hour restart is inserted when the balance is exhausted or cannot support the next pre-trip plus additional driving. Because prior daily records are not supplied, the planner conservatively shows the full 34-hour restart rather than crediting the separate pre-departure rest.
- Paper-log 70-hour recap values use the documented conservative estimate: no starting hours age out before a scheduled 34-hour restart, A and C equal projected cycle use at day end, and B equals the remaining balance. The 60-hour/7-day recap is not used.
- A simultaneous cycle and daily reset becomes one 34-hour block.
- Pickup or drop-off work may finish after an arrival at a driving limit because those limits prohibit more driving, not all work.
- The home-terminal log day is assumed to run midnight-to-midnight. When no timezone is entered, Current location is only a proxy for the actual home-terminal timezone and must be verified.
- Rest and break markers are interpolated planning positions, not verified truck-parking facilities; the driver must confirm safe, legal parking before the trip.

Split-sleeper calculations, short-haul exceptions, adverse-condition extensions, team driving, personal conveyance, traffic, and weather are intentionally excluded. The contiguous one-hour Off Duty plus nine-hour Sleeper Berth daily-rest block is not a split-sleeper calculation.

Daily sheets are split at midnight in the home-terminal timezone, with exactly one primary paper-log sheet generated for every calendar day touched by the trip. A driving event crossing midnight is interpolated to the correct route position for that sheet's From/To values and remarks. Unique duty-change and midnight positions are reverse-geocoded once per plan, and the resulting city/state label is reused by the driving event before a stop, the stop, the following drive, and the daily sheet. Every operational non-driving period except Sleeper Berth gets one U-shaped paper bracket and one two-line location/activity description, such as `Richmond, VA` over `Pre-trip` or `Nashville, TN` over `Pickup`, with a divider between the two lines. Driving and Sleeper Berth changes remain in the accessible chronological remarks list without repeating labels beneath the paper ruler, whose visible total is `=24`. Time before plan start and after trip completion is Off Duty, active statuses carry through midnight, the four paper-grid status totals reconcile to 24 hours, and daily mileage reconciles to route mileage. No post-trip event is invented; the canonical trip ends with the required one-hour drop-off and the remainder of the sheet is projected Off Duty. The print layout keeps each full daily sheet together and starts the next sheet on a new PDF page. A trip ending exactly at midnight remains on the prior sheet with a `24:00` completion remark rather than creating an empty next-day sheet. On daylight-saving transition dates, the real 23- or 25-hour interval is projected monotonically onto the 24-hour paper grid and clearly noted.

## Checks

```bash
backend/.venv/bin/ruff check backend
backend/.venv/bin/ruff format --check backend
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/pytest backend
pnpm --filter frontend lint
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter frontend build
pnpm --filter frontend test:e2e
```

The local and CI Playwright configurations both use bundled Chromium. Install it once before the first browser run:

```bash
pnpm --filter frontend exec playwright install chromium
pnpm --filter frontend test:e2e
```

The backend suite covers event ordering/non-overlap, recurring pre-trips, the meal-plus-sleeper rest sequence, 8/11/14-hour boundaries, pickup/fuel break qualification, 0/near-70/70 cycle inputs, On Duty work above 70 without further driving, combined resets, multiple fuel intervals, leg-aware route interpolation, midnight/timezone and daylight-saving splitting, mileage and 24-hour invariants, provider failures, and request validation. Frontend tests cover form and result interactions, storage, daily tabs, accessible remarks, recap values above 70, responsive log controls, and metadata. Playwright starts isolated demo servers on dedicated ports and runs the complete generation-to-logs flow at desktop and mobile sizes, so a developer's real-provider servers cannot make the smoke test nondeterministic. GitHub Actions runs linting, type checks, both test suites, the production build, and these browser smoke tests.

## Deploy as two Vercel projects

Use this one repository for two projects. Vercel environment variables are configured independently for each project; the root `.env` is for local development only and must never be committed.

1. **API project** — root directory `backend`; add `GEOAPIFY_API_KEY`, `USE_DEMO_PROVIDER=false`, a strong unique `DJANGO_SECRET_KEY` of at least 50 characters, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, and `CORS_ALLOWED_ORIGINS`. Keep the Geoapify key here only; it must never be exposed through a `VITE_` variable. `DJANGO_ALLOWED_HOSTS` is a comma-separated hostname list without schemes, while `CORS_ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins including `https://`. Python 3.12 is pinned in `backend/.python-version`. HTTPS redirect, secure-cookie, and one-year HSTS defaults turn on automatically when debug is false.
2. **Frontend project** — root directory `frontend`; set `VITE_API_BASE_URL` to the deployed HTTPS API origin before building. This value is embedded into the browser bundle at build time, so changing it requires a redeploy.

Both folders include Vercel routing configuration. Add the final production origins to the backend host/CORS variables before the first end-to-end production check. Local `.vercel/` link metadata is ignored by Git.

Before sharing the assessment, verify `GET /api/v1/health` returns HTTP `200` with `provider: "geoapify"` and `configured: true`, generate one real route from the production frontend, open every daily sheet, and save a PDF once. Then replace every placeholder in **Submission links**.

## Suggested 3–5 minute Loom outline

1. Show the four assessment inputs and collapsed trip/log settings.
2. Generate the sample route and point out summary metrics, numbered map stops, itinerary, directions, assumptions, and warnings.
3. Open a multi-day example and move across date tabs.
4. Show the filled log trace, totals, remarks, fullscreen view, and Print/Save PDF.
5. Briefly show the Django scheduling/projection modules and React page/component structure.
6. End with the automated checks, Vercel configuration, demo-vs-Geoapify behavior, and known limitations.

## Official references

- [FMCSA summary of property-carrying hours-of-service rules](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- [Geoapify Routing API documentation](https://apidocs.geoapify.com/docs/routing/)
- [OpenFreeMap quick start and attribution guidance](https://openfreemap.org/quick_start/)
- [Vercel zero-configuration Django support](https://vercel.com/changelog/zero-configuration-django-support)
- [Vercel-supported package managers](https://vercel.com/docs/package-managers)
- [Playwright browser installation and channel documentation](https://playwright.dev/docs/browsers)

## Limitations

- This is a planning aid, not an FMCSA-certified ELD, legal opinion, dispatch system, or navigation product.
- The starting cycle value is a simplified scalar. Historical eight-day records are unavailable, so the displayed 70-hour A/B/C values are conservative estimates rather than a reconstruction of the driver's true rolling recap.
- Demo mode uses deterministic interpolated geometry and estimated driving speed. Configure Geoapify for road-level truck routes and real place data.
- Fuel lookup accepts only suggestions within five straight-line miles and keeps the scheduled marker anchored to the route; it reports the offset and does not claim or add an unmodeled station-driveway detour.
- Required duty-change reverse geocoding is accuracy-critical. If it is unavailable, generation returns an explicit provider error instead of producing route-mile placeholders in the daily logs.
- No account, database, saved trip history, collaborative workflow, or server-side PDF archive is included by design.
