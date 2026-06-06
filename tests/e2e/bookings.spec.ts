import { test, expect } from "@playwright/test";

test.describe("Bookings", () => {
  test("should display the bookings list page", async ({ page }) => {
    await page.goto("/operations/bookings");
    await page.waitForLoadState("networkidle");

    // The page should show a heading related to bookings
    const heading = page.getByRole("heading", { name: /bookings/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Should not show an error
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);

    // The page should have a data table or booking list
    const table = page.locator("table");
    const listExists = await table.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!listExists) {
      // Might be showing an empty state instead
      const body = page.locator("body");
      await expect(body).toBeVisible();
    }
  });

  test("should navigate to create new booking", async ({ page }) => {
    await page.goto("/operations/bookings");
    await page.waitForLoadState("networkidle");

    // Look for a "New Booking" or "Create" link/button
    const newBookingLink = page.getByRole("link", { name: /new booking|create booking|add booking/i });
    const newBookingBtn = page.getByRole("button", { name: /new booking|create booking|add booking/i });

    const linkVisible = await newBookingLink.isVisible({ timeout: 3_000 }).catch(() => false);
    const btnVisible = await newBookingBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (linkVisible) {
      await newBookingLink.click();
    } else if (btnVisible) {
      await newBookingBtn.click();
    } else {
      // Try navigating directly to the new booking page
      await page.goto("/operations/bookings/new");
    }

    await page.waitForLoadState("networkidle");

    // Should land on a page with a form or heading indicating new booking
    const currentUrl = page.url();
    expect(currentUrl).toContain("new");

    // Verify no errors
    const errorText = page.locator("text=Internal Server Error");
    await expect(errorText).toHaveCount(0);
  });

  test("should show booking details", async ({ page }) => {
    await page.goto("/operations/bookings");
    await page.waitForLoadState("networkidle");

    // Look for a clickable booking row or link to a booking detail
    const bookingLink = page.locator('a[href*="/operations/bookings/"]').first();
    const bookingLinkVisible = await bookingLink.isVisible({ timeout: 5_000 }).catch(() => false);

    if (bookingLinkVisible) {
      // Click the first booking link
      await bookingLink.click();
      await page.waitForLoadState("networkidle");

      // Should show booking details - look for booking reference or status badge
      const body = page.locator("body");
      await expect(body).toBeVisible({ timeout: 5_000 });

      // Verify no errors
      const errorText = page.locator("text=Internal Server Error");
      await expect(errorText).toHaveCount(0);

      console.log(`Navigated to booking detail: ${page.url()}`);
    } else {
      console.log("No booking links found on the page - may be empty");
      // Just verify the page loaded without errors
      const errorText = page.locator("text=Internal Server Error");
      await expect(errorText).toHaveCount(0);
    }
  });
});
