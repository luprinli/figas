import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    // Clear any existing auth state for this test
    await page.context().clearCookies();

    // Try to access a protected page
    await page.goto("/operations/schedule", { waitUntil: "networkidle" });

    // Should be redirected to login page
    const currentUrl = page.url();
    expect(currentUrl).toContain("/login");

    // The login page should have the sign-in form
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible({ timeout: 5_000 });
    await expect(passwordInput).toBeVisible({ timeout: 5_000 });
    await expect(submitButton).toBeVisible({ timeout: 5_000 });
  });

  test("should display login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // The login page should have a heading or title
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 5_000 });

    // Should have email and password fields
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');

    await expect(emailInput).toBeVisible({ timeout: 5_000 });
    await expect(passwordInput).toBeVisible({ timeout: 5_000 });

    // Should have a submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible({ timeout: 5_000 });
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Fill in invalid credentials
    await page.fill('input[name="email"]', "invalid@example.com");
    await page.fill('input[name="password"]', "wrongpassword");

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for the response
    await page.waitForLoadState("networkidle");

    // Should show an error message
    const errorText = page.locator("text=Invalid credentials");
    await expect(errorText).toBeVisible({ timeout: 5_000 });
  });
});
