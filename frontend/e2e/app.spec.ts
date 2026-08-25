import { expect, test } from "@playwright/test";

test("generates a route, synchronizes stops, and opens filled daily logs", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
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

  await page.goto("/");
  await expect(page).toHaveTitle("Route & ELD Logs");
  await expect(page.getByRole("heading", { name: "Enter trip details" })).toBeVisible();

  await page.getByRole("button", { name: "Generate route & logs" }).click();
  await expect(page.getByRole("heading", { name: "Route plan" })).toBeVisible();
  const distanceMetric = page.getByLabel("Trip summary")
    .locator(".route-summary__metric")
    .filter({ hasText: "Distance" });
  await expect(distanceMetric.locator("dd")).toHaveText(/^[\d,]+ mi$/);
  await expect(page.getByText(/Deterministic demo route/)).toBeVisible();
  await expect(page.getByLabel("Truck route map with scheduled stops")).toBeVisible();
  await expect(page.locator(".route-map-shell")).toHaveAttribute("data-map-status", "ready");
  await expect(page.locator(".route-map canvas")).toBeVisible();
  await expect(page.locator("link[rel='preconnect'][href='https://tiles.openfreemap.org']")).toHaveCount(1);

  await expect(page.locator(".directions-panel__body li")).toHaveCount(0);
  await page.getByText(/Turn-by-turn route instructions/).click();
  expect(await page.locator(".directions-panel__body li").count()).toBeGreaterThan(0);

  const mapMarkers = page.locator(".route-map .map-marker");
  const itineraryStops = page.locator(".itinerary-stop");
  await expect(mapMarkers).toHaveCount(await itineraryStops.count());
  await page.locator(".route-map .map-marker[aria-label*='drop-off' i]").click();
  await expect(page.locator(".route-map .map-marker[aria-label*='drop-off' i]")).toHaveAttribute("aria-pressed", "true");
  const selectedStop = page.locator(".itinerary-stop[aria-pressed='true']");
  await expect(selectedStop).toContainText("Drop-off");
  await expect(selectedStop).toContainText("Dallas");

  await page.getByRole("link", { name: /View daily logs/ }).click();
  await expect(page).toHaveURL(/\/logs$/);
  await expect(page.getByRole("heading", { name: "Daily logs" })).toBeVisible();
  await expect(page.getByText("Generated trip plan — not a certified ELD record.")).toBeVisible();
  await expect(page.locator(".log-stage .daily-log-template")).toHaveCount(1);
  await expect(page.locator(".log-sheet image, .log-sheet foreignObject")).toHaveCount(0);
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
  await dayTwo.click();
  await expect(dayTwo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Day 2 summary" })).toBeVisible();

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
