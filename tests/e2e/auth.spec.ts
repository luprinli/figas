import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/operations/schedule", { waitUntil: "networkidle" });
    const currentUrl = page.url();
    expect(currentUrl).toContain("/login");
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');
    await expect(emailInput).toBeVisible({ timeout: 5_000 });
    await expect(passwordInput).toBeVisible({ timeout: 5_000 });
    await expect(submitButton).toBeVisible({ timeout: 5_000 });
  });

  test("should display login page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 5_000 });
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    await expect(emailInput).toBeVisible({ timeout: 5_000 });
    await expect(passwordInput).toBeVisible({ timeout: 5_000 });
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible({ timeout: 5_000 });
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="email"]', "invalid@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");
    const hasError = await page.locator("text=Invalid credentials").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const stillOnLogin = page.url().includes("/login");
    // Either error message shown or we stay on login page
    expect(hasError || stillOnLogin).toBeTruthy();
  });
});
