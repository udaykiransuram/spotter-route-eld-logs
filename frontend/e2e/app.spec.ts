import { expect, test } from "@playwright/test";

test("generates a route, synchronizes stops, and opens filled daily logs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle("Route & ELD Logs");
  await expect(page.getByRole("heading", { name: "Enter trip details" })).toBeVisible();

  await page.getByRole("button", { name: "Generate route & logs" }).click();
  await expect(page.getByRole("heading", { name: "Route plan" })).toBeVisible();
  await expect(page.getByLabel("Trip summary")).toContainText("1,313 mi");
  await expect(page.getByLabel("Truck route map with scheduled stops")).toBeVisible();
  await expect(page.locator(".route-map canvas")).toBeVisible();

  await page.getByRole("button", { name: /^6\. Dallas, TX:/ }).click();
  await expect(page.locator(".itinerary-stop[aria-pressed='true']")).toContainText("Drop-off");

  await page.getByRole("link", { name: /View daily logs/ }).click();
  await expect(page).toHaveURL(/\/logs$/);
  await expect(page.getByRole("heading", { name: "Daily logs" })).toBeVisible();
  await expect(page.getByText("Generated trip plan — not a certified ELD record.")).toBeVisible();

  const dayTwo = page.getByRole("tab", { name: /Day 2/ });
  await dayTwo.click();
  await expect(dayTwo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Day 2 summary" })).toBeVisible();

  await page.evaluate(() => {
    window.print = () => document.documentElement.setAttribute("data-print-called", "true");
  });
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(pageErrors).toEqual([]);
});
