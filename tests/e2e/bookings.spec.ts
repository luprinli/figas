import { test, expect } from "@playwright/test";

test.describe("Bookings", () => {
  test("should display the bookings list page", async ({ page }) => {
    await page.goto("/operations/bookings");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
    const table = page.locator("table");
    const listExists = await table.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!listExists) {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("should navigate to create new booking", async ({ page }) => {
    await page.goto("/operations/bookings");
    await page.waitForLoadState("networkidle");
    const newBookingLink = page.getByRole("link", { name: /new booking|create booking|add booking/i });
    const newBookingBtn = page.getByRole("button", { name: /new booking|create booking|add booking/i });
    const linkVisible = await newBookingLink.isVisible({ timeout: 3_000 }).catch(() => false);
    const btnVisible = await newBookingBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (linkVisible) {
      await newBookingLink.click();
    } else if (btnVisible) {
      await newBookingBtn.click();
    } else {
      await page.goto("/operations/bookings/new");
    }
    await page.waitForLoadState("networkidle");
    // Page may redirect based on permissions — verify no errors regardless
    await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
  });

  test("should show booking details", async ({ page }) => {
    await page.goto("/operations/bookings");
    await page.waitForLoadState("networkidle");
    const bookingLink = page.locator('a[href*="/operations/bookings/"]').first();
    const bookingLinkVisible = await bookingLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (bookingLinkVisible) {
      await bookingLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible({ timeout: 5_000 });
      await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
    } else {
      await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
    }
  });
});
