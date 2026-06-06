import { test, expect } from "@playwright/test";

test.describe("Check-In", () => {
  test("should display check-in page", async ({ page }) => {
    await page.goto("/checkin");
    await page.waitForLoadState("networkidle");

    // The page should show a heading related to check-in
    const heading = page.getByRole("heading", { name: /check.?in/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);

    // Should show the lookup option
    const lookupLink = page.getByRole("link", { name: /lookup/i });
    await expect(lookupLink).toBeVisible({ timeout: 5_000 });
  });

  test("should show lookup functionality", async ({ page }) => {
    await page.goto("/checkin/lookup");
    await page.waitForLoadState("networkidle");

    // The lookup page should have a search form
    const heading = page.getByRole("heading", { name: /lookup/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should have a search input
    const searchInput = page.locator('input[type="text"], input[name="q"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Should have a search/submit button
    const searchButton = page.locator('button[type="submit"]');
    await expect(searchButton).toBeVisible({ timeout: 5_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);
  });
});
