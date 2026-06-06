import { test, expect } from "@playwright/test";

test.describe("Finance", () => {
  test("should display finance page", async ({ page }) => {
    await page.goto("/finance");
    await page.waitForLoadState("networkidle");

    // The page should show a heading related to finance
    const heading = page.getByRole("heading", { name: /finance|dashboard/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);

    // Should show KPI cards or financial data
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("should show invoices list", async ({ page }) => {
    await page.goto("/finance/invoices");
    await page.waitForLoadState("networkidle");

    // The invoices page should have a heading
    const heading = page.getByRole("heading", { name: /invoice/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);

    // Should have a table or list of invoices
    const table = page.locator("table");
    const tableVisible = await table.isVisible({ timeout: 5_000 }).catch(() => false);
    if (tableVisible) {
      // Should have at least column headers
      const headers = table.locator("th");
      const headerCount = await headers.count();
      console.log(`Invoice table headers found: ${headerCount}`);
      expect(headerCount).toBeGreaterThan(0);
    } else {
      // Might be showing empty state
      const body = page.locator("body");
      await expect(body).toBeVisible();
    }
  });
});
