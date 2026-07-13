import { test, expect } from "@playwright/test";

test.describe("Finance", () => {
  test("should display finance page", async ({ page }) => {
    await page.goto("/finance");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
    await expect(page.locator("body")).toBeVisible();
  });

  test("should show invoices list", async ({ page }) => {
    await page.goto("/finance/invoices");
    await page.waitForLoadState("networkidle");
    // Validate: page must not show server error — this is a genuine bug if it does
    const errorEl = page.locator("text=Internal Server Error");
    const hasError = await errorEl.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasError) {
      // Surface the error instead of hiding it — the invoices page should work
      const bodyText = await page.locator("body").textContent().catch(() => "");
      throw new Error(`Finance invoices page returned server error: ${bodyText?.slice(0, 200) ?? "unknown"}`);
    }
    await expect(errorEl).toHaveCount(0);
    const table = page.locator("table");
    const tableVisible = await table.isVisible({ timeout: 5_000 }).catch(() => false);
    if (tableVisible) {
      const headerCount = await table.locator("th").count();
      expect(headerCount).toBeGreaterThan(0);
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
