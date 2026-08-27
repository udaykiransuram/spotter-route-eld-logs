import { expect, test } from "@playwright/test";

test("keeps the landing preview stable while optional details expand", async ({ page }) => {
  const tripPlanRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/trip-plans") {
      tripPlanRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/");

  const guidance = page.getByRole("region", { name: "Your route, stops, and logs in one view" });
  const mapPreview = guidance.getByRole("group", { name: "Live route preview" });
  const plannedLocations = mapPreview.getByRole("list", { name: "Planned route locations" });
  await expect(guidance).toBeVisible();
  await expect(plannedLocations).toContainText("Richmond, VA");
  await expect(plannedLocations).toContainText("Nashville, TN");
  await expect(plannedLocations).toContainText("Dallas, TX");
  await expect(guidance.getByRole("listitem").filter({
    hasText: "Select all three locations.",
  })).toBeVisible();

  const measurePreview = () => page.evaluate(() => {
    const map = document.querySelector(".empty-results__map");
    const guidancePanel = document.querySelector(".empty-results--intro");
    if (!(map instanceof HTMLElement) || !(guidancePanel instanceof HTMLElement)) {
      throw new Error("Landing preview elements are missing");
    }
    return {
      mapHeight: map.getBoundingClientRect().height,
      guidanceWidth: guidancePanel.getBoundingClientRect().width,
    };
  });
  const before = await measurePreview();

  const optionalDetailsButton = page.getByRole("button", {
    name: "Trip & log settings",
    exact: true,
  });
  await expect(optionalDetailsButton).toHaveAttribute("aria-expanded", "false");
  await optionalDetailsButton.click();
  await expect(optionalDetailsButton).toHaveAttribute("aria-expanded", "true");

  const optionalDetails = page.getByRole("region", { name: "Trip & log settings" });
  await expect(optionalDetails).toBeVisible();
  const paperFields = [
    ["Driver", "Alex Driver"],
    ["Carrier", "Spotter Freight"],
    ["Vehicle identifiers", "Tractor 18"],
    ["Shipping details", "BOL 547"],
  ] as const;
  for (const [label, value] of paperFields) {
    const field = optionalDetails.getByRole("textbox", { name: label, exact: true });
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }

  await expect(plannedLocations).toContainText("Richmond, VA");
  await expect(plannedLocations).toContainText("Nashville, TN");
  await expect(plannedLocations).toContainText("Dallas, TX");

  const after = await measurePreview();
  expect(Math.abs(after.mapHeight - before.mapHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.guidanceWidth - before.guidanceWidth)).toBeLessThanOrEqual(1);
  expect(tripPlanRequests).toEqual([]);

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
});

test("generates a route, synchronizes stops, and opens filled daily logs", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  let releaseTripPlanRequest!: () => void;
  const tripPlanRequestGate = new Promise<void>((resolve) => {
    releaseTripPlanRequest = resolve;
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("https://tiles.openfreemap.org/styles/liberty", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#edf3f2" } }],
      }),
    });
  });
  await page.route("**/api/v1/trip-plans", async (route) => {
    await tripPlanRequestGate;
    await route.continue();
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Route & ELD Logs");
  await expect(page.getByRole("heading", { name: "Enter trip details" })).toBeVisible();

  await page.getByRole("button", { name: "Generate route & logs" }).click();
  const generationStatus = page.getByRole("status").filter({ hasText: "Building your route & logs" });
  await expect(generationStatus).toBeVisible();
  await expect(page.getByRole("button", { name: "Generating route…" })).toBeDisabled();
  const loadingWidths = await generationStatus.evaluate((status) => ({
    viewport: window.innerWidth,
    statusRight: status.getBoundingClientRect().right,
    document: document.documentElement.scrollWidth,
  }));
  expect(loadingWidths.statusRight).toBeLessThanOrEqual(loadingWidths.viewport + 1);
  expect(loadingWidths.document).toBeLessThanOrEqual(loadingWidths.viewport + 1);
  if (testInfo.project.name === "desktop-chromium") {
    const loadingSpacing = await page.evaluate(() => {
      const formCard = document.querySelector(".route-workspace__left");
      const settings = document.querySelector(".settings-panel");
      const submit = document.querySelector(".planner-submit");
      if (!(formCard instanceof HTMLElement)
        || !(settings instanceof HTMLElement)
        || !(submit instanceof HTMLElement)) {
        throw new Error("Loading form layout elements are missing");
      }
      const cardRect = formCard.getBoundingClientRect();
      const settingsRect = settings.getBoundingClientRect();
      const submitRect = submit.getBoundingClientRect();
      return {
        cardHeight: cardRect.height,
        gapBeforeSubmit: submitRect.top - settingsRect.bottom,
      };
    });
    expect(loadingSpacing.cardHeight).toBeLessThan(700);
    expect(loadingSpacing.gapBeforeSubmit).toBeLessThanOrEqual(24);
  }
  releaseTripPlanRequest();
  await expect(page.getByRole("heading", { name: "Route plan" })).toBeVisible();
  await expect(generationStatus).toHaveCount(0);
  const distanceMetric = page.getByLabel("Trip summary")
    .locator(".route-summary__metric")
    .filter({ hasText: "Distance" });
  await expect(distanceMetric.locator("dd")).toHaveText(/^[\d,]+ mi$/);
  await expect(page.getByText(/Deterministic demo route/)).toBeVisible();
  await expect(page.getByLabel("Truck route map with scheduled stops")).toBeVisible();
  await expect(page.locator(".route-map-shell")).toHaveAttribute("data-map-status", "ready");
  await expect(page.locator(".route-map canvas")).toBeVisible();
  await expect(page.locator("link[rel='preconnect'][href='https://tiles.openfreemap.org']")).toHaveCount(1);
  const mapControls = page.getByRole("group", { name: "Map controls" });
  await expect(mapControls).toBeVisible();
  const expectedControlSize = testInfo.project.name === "mobile-chromium" ? 44 : 40;
  for (const controlName of ["Zoom in", "Zoom out", "Fit full route"]) {
    const control = mapControls.getByRole("button", { name: controlName });
    await expect(control).toBeVisible();
    const controlBox = await control.boundingBox();
    expect(controlBox?.width).toBeGreaterThanOrEqual(expectedControlSize);
    expect(controlBox?.height).toBeGreaterThanOrEqual(expectedControlSize);
  }
  await mapControls.getByRole("button", { name: "Zoom in" }).click();
  await mapControls.getByRole("button", { name: "Zoom out" }).click();
  await mapControls.getByRole("button", { name: "Fit full route" }).click();

  if (testInfo.project.name === "desktop-chromium") {
    const routePlan = page.getByRole("complementary", { name: "Route plan" });
    const initialScrollLayout = await routePlan.evaluate((panel) => {
      const itinerary = panel.querySelector(".itinerary");
      if (!(itinerary instanceof HTMLElement)) {
        throw new Error("Route itinerary is missing");
      }
      return {
        panelClientHeight: panel.clientHeight,
        panelScrollHeight: panel.scrollHeight,
        panelOverflow: getComputedStyle(panel).overflowY,
        itineraryOverflow: getComputedStyle(itinerary).overflowY,
      };
    });
    expect(initialScrollLayout.panelScrollHeight).toBeGreaterThan(initialScrollLayout.panelClientHeight);
    expect(initialScrollLayout.panelOverflow).toBe("auto");
    expect(initialScrollLayout.itineraryOverflow).toBe("visible");

    await routePlan.evaluate((panel) => panel.scrollTo({ top: panel.scrollHeight }));
    const scrolledLayout = await routePlan.evaluate((panel) => {
      const header = panel.querySelector(".itinerary-panel__header");
      const attribution = panel.querySelector(".itinerary-panel__attribution");
      const itinerary = panel.querySelector(".itinerary");
      if (!(header instanceof HTMLElement)
        || !(attribution instanceof HTMLElement)
        || !(itinerary instanceof HTMLElement)) {
        throw new Error("Route plan chrome is missing");
      }
      const panelRect = panel.getBoundingClientRect();
      return {
        panelTop: panelRect.top,
        panelBottom: panelRect.bottom,
        scrollTop: panel.scrollTop,
        headerBottom: header.getBoundingClientRect().bottom,
        attributionBottom: attribution.getBoundingClientRect().bottom,
        itineraryScrollTop: itinerary.scrollTop,
      };
    });
    expect(scrolledLayout.scrollTop).toBeGreaterThan(0);
    expect(scrolledLayout.itineraryScrollTop).toBe(0);
    expect(scrolledLayout.headerBottom).toBeLessThanOrEqual(scrolledLayout.panelTop + 1);
    expect(scrolledLayout.attributionBottom).toBeLessThanOrEqual(scrolledLayout.panelBottom + 1);
    await routePlan.evaluate((panel) => panel.scrollTo({ top: 0 }));
  }

  await expect(page.locator(".directions-panel__body li")).toHaveCount(0);
  await page.getByText(/Turn-by-turn route instructions/).click();
  expect(await page.locator(".directions-panel__body li").count()).toBeGreaterThan(0);

  const mapMarkers = page.locator(".route-map .map-marker");
  const currentLocationMarker = page.getByRole("img", { name: /Current location, Richmond/i });
  const scheduledMapMarkers = page.locator(".route-map button.map-marker");
  const itineraryStops = page.locator(".itinerary-stop");
  const itineraryStopCount = await itineraryStops.count();
  await expect(currentLocationMarker).toBeVisible();
  await expect(currentLocationMarker.locator(".map-marker__icon")).toHaveCount(1);
  await expect(page.locator(".route-map .map-stop-marker[role='button']")).toHaveCount(0);
  await expect(page.locator(".route-map .map-stop-marker[aria-label='Map marker']")).toHaveCount(0);
  await expect(mapMarkers).toHaveCount(itineraryStopCount + 1);
  await expect(scheduledMapMarkers).toHaveCount(itineraryStopCount);
  await expect(mapMarkers.locator(".map-marker__icon")).toHaveCount(itineraryStopCount + 1);
  await expect(scheduledMapMarkers.locator(".map-marker__sequence")).toHaveCount(itineraryStopCount);
  await expect(itineraryStops.locator(".stop-number > svg")).toHaveCount(itineraryStopCount);
  await expect(itineraryStops.locator(".stop-number__sequence")).toHaveCount(itineraryStopCount);
  await page.locator(".route-map .map-marker[aria-label*='drop-off' i]").click();
  await expect(page.locator(".route-map .map-marker[aria-label*='drop-off' i]")).toHaveAttribute("aria-pressed", "true");
  const selectedStop = page.locator(".itinerary-stop[aria-pressed='true']");
  await expect(selectedStop).toContainText("Drop-off");
  await expect(selectedStop).toContainText("Dallas");

  const planBasis = page.getByRole("region", { name: "Plan basis" });
  await planBasis.scrollIntoViewIfNeeded();
  await expect(planBasis).toBeVisible();
  await expect(planBasis.getByText("Assessment assumptions")).toBeVisible();
  await expect(planBasis.getByText("Planning model choices")).toBeVisible();
  await expect(planBasis.getByText("Important limitations")).toBeVisible();
  await expect(planBasis.getByText("17 assumptions")).toBeVisible();
  await expect(planBasis.getByText("4 warnings", { exact: true })).toBeVisible();
  await expect(planBasis.locator(".assumptions__item--assumption")).toHaveCount(17);
  await expect(planBasis.getByRole("note")).toHaveCount(4);
  await expect(planBasis.locator(".lucide-circle-check")).toHaveCount(0);
  const planningGroup = planBasis.locator('[data-assumption-group="planning"]');
  await expect(planningGroup).not.toHaveAttribute("open", "");
  await planningGroup.locator("summary").click();
  await expect(planningGroup).toHaveAttribute("open", "");
  const planBasisWidths = await planBasis.evaluate((panel) => ({
    panelClientWidth: panel.clientWidth,
    panelScrollWidth: panel.scrollWidth,
    groups: [...panel.querySelectorAll(".assumptions__group")].map((group) => ({
      clientWidth: group.clientWidth,
      scrollWidth: group.scrollWidth,
    })),
  }));
  expect(planBasisWidths.panelScrollWidth).toBeLessThanOrEqual(planBasisWidths.panelClientWidth + 1);
  for (const group of planBasisWidths.groups) {
    expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth + 1);
  }

  await page.getByRole("link", { name: /View daily logs/ }).click();
  await expect(page).toHaveURL(/\/logs$/);
  await expect(page.getByRole("heading", { name: "Daily logs" })).toBeVisible();
  await expect(page.getByText("Generated trip plan — not a certified ELD record.")).toBeVisible();
  await expect(page.locator(".log-stage .daily-log-template")).toHaveCount(1);
  await expect(page.locator(".log-sheet image, .log-sheet foreignObject")).toHaveCount(0);
  const paperLog = page.locator(".log-stage .log-sheet");
  await expect(paperLog.locator('[data-paper-recap="estimate-label"]')).toHaveText("Estimated from cycle total");
  for (const recapKey of ["a", "b", "c"]) {
    await expect(paperLog.locator(`[data-paper-recap="seventy-hour-${recapKey}"]`)).toHaveText(/^\d+\.\d{2}$/);
  }
  await expect(paperLog.locator('[data-paper-recap="sixty-hour-not-applicable"]')).toHaveText([
    "N/A",
    "N/A",
    "N/A",
  ]);
  const generatedLogCount = await page.locator("[role='tablist'][aria-label='Trip days'] [role='tab']").count();
  expect(generatedLogCount).toBeGreaterThan(1);

  if (testInfo.project.name === "mobile-chromium") {
    const mobileSizing = await page.locator(".log-paper-scroll").evaluate((scrollRegion) => {
      const sheet = scrollRegion.querySelector(".log-sheet");
      if (!sheet) return null;
      return {
        regionWidth: scrollRegion.getBoundingClientRect().width,
        sheetWidth: sheet.getBoundingClientRect().width,
      };
    });
    expect(mobileSizing).not.toBeNull();
    expect(mobileSizing!.sheetWidth).toBeLessThanOrEqual(mobileSizing!.regionWidth + 1);
  }

  await page.evaluate(() => {
    let fullscreenElement: Element | null = null;
    const setFullscreenElement = (element: Element | null) => {
      fullscreenElement = element;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    HTMLElement.prototype.requestFullscreen = async function requestFullscreen() {
      setFullscreenElement(this);
    };
    document.exitFullscreen = async () => {
      setFullscreenElement(null);
    };
  });
  await page.getByRole("button", { name: "View full screen" }).click();
  await expect(page.locator(".log-stage").getByRole("button", { name: "Exit full screen" })).toBeVisible();
  await page.locator(".log-stage").getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.locator(".log-stage").getByRole("button", { name: "Exit full screen" })).toHaveCount(0);

  const dayTwo = page.getByRole("tab", { name: /Day 2/ });
  if (testInfo.project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Next day" }).click();
  } else {
    await dayTwo.click();
  }
  await expect(dayTwo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Day 2 summary" })).toBeVisible();
  if (testInfo.project.name === "mobile-chromium") {
    const selectedTabIsVisible = await dayTwo.evaluate((tab) => {
      const scroller = tab.closest(".day-tabs");
      if (!(scroller instanceof HTMLElement)) return false;
      const tabRect = tab.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      return tabRect.left >= scrollerRect.left - 1 && tabRect.right <= scrollerRect.right + 1;
    });
    expect(selectedTabIsVisible).toBe(true);
  }

  await page.evaluate(() => {
    window.print = () => document.documentElement.setAttribute("data-print-called", "true");
  });
  await expect(page.locator(".print-log-page")).toHaveCount(0);
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-all-logs")).toBeVisible();
  await expect(page.locator(".print-log-page")).toHaveCount(generatedLogCount);
  await expect(page.locator(".print-log-details-page")).toHaveCount(0);
  const printFitsPage = await page.locator(".print-log-page").first().evaluate((printPage) => {
    const sheet = printPage.querySelector(".log-sheet");
    if (!sheet) return false;
    const pageRect = printPage.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    return sheetRect.width <= pageRect.width + 1 && sheetRect.height <= pageRect.height + 1;
  });
  expect(printFitsPage).toBe(true);
  await page.emulateMedia({ media: "screen" });

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("keeps the itinerary usable when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "WebGLRenderingContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "WebGL2RenderingContext", { configurable: true, value: undefined });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Generate route & logs" }).click();

  await expect(page.getByRole("alert")).toContainText("Route map unavailable");
  await expect(page.getByRole("alert")).toContainText("itinerary, stop details, and daily logs are still available");
  await expect(page.getByRole("heading", { name: "Route plan" })).toBeVisible();
  await expect(page.locator(".itinerary-stop").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /View daily logs/ })).toBeEnabled();
});
