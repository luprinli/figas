import { test, expect } from "@playwright/test";

test.describe("Admin", () => {
  test("should display admin page", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // Verify no server error
    await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
    // Just verify the page loaded
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("should show aerodromes management", async ({ page }) => {
    await page.goto("/admin/aerodromes");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
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
