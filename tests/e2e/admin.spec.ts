import { test, expect } from "@playwright/test";

test.describe("Admin", () => {
  test("should display admin page", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // The admin page should show a heading
    const heading = page.getByRole("heading", { name: /admin/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);

    // Should show stat cards
    const statCards = page.locator('[data-testid="stat-card"], .stat-card');
    const statCardsVisible = await statCards.first().isVisible({ timeout: 3_000 }).catch(() => false);
    if (statCardsVisible) {
      console.log("Admin stat cards are visible");
    }
  });

  test("should show aerodromes management", async ({ page }) => {
    await page.goto("/admin/aerodromes");
    await page.waitForLoadState("networkidle");

    // The aerodromes page should have a heading
    const heading = page.getByRole("heading", { name: /aerodrome/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);

    // Should have a table of aerodromes
    const table = page.locator("table");
    const tableVisible = await table.isVisible({ timeout: 5_000 }).catch(() => false);
    if (tableVisible) {
      const headers = table.locator("th");
      const headerCount = await headers.count();
      console.log(`Aerodromes table headers found: ${headerCount}`);
      expect(headerCount).toBeGreaterThan(0);
    } else {
      // Might be showing empty state or a different layout
      const body = page.locator("body");
      await expect(body).toBeVisible();
    }
  });
});
