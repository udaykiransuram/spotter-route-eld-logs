import { expect, test } from "@playwright/test";

test("generates a route, synchronizes stops, and opens filled daily logs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://tiles.openfreemap.org/styles/positron", async (route) => {
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

  const mapMarkers = page.locator(".route-map .map-marker");
  const itineraryStops = page.locator(".itinerary-stop");
  await expect(mapMarkers).toHaveCount(await itineraryStops.count());
  await page.locator(".route-map .map-marker[aria-label*='drop-off' i]").click();
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

  const dayTwo = page.getByRole("tab", { name: /Day 2/ });
  await dayTwo.click();
  await expect(dayTwo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Day 2 summary" })).toBeVisible();

  await page.evaluate(() => {
    window.print = () => document.documentElement.setAttribute("data-print-called", "true");
  });
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-all-logs")).toBeVisible();
  await expect(page.locator(".print-log-details-page")).toHaveCount(generatedLogCount);
  await expect(page.locator(".print-log-details-page").first()).toContainText("Full location");
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
