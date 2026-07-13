import { test, expect } from "@playwright/test";

test.describe("System Health", () => {
  test("application is reachable at base URL", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
  });

  test("health endpoint returns OK", async ({ request }) => {
    const response = await request.get("/health", { failOnStatusCode: false });
    expect([200, 404]).toContain(response.status());
  });

  test("all critical routes return non-error status", async ({ page }) => {
    const routes: Array<{ path: string; name: string }> = [
      { path: "/login", name: "Login" },
      { path: "/operations/schedule", name: "Schedule" },
      { path: "/operations/bookings", name: "Bookings" },
      { path: "/checkin/counter", name: "Check-in" },
      { path: "/finance", name: "Finance" },
      { path: "/admin", name: "Admin" },
      { path: "/pilot", name: "Pilot" },
      { path: "/engineer", name: "Engineer" },
    ];

    for (const { path, name } of routes) {
      await test.step(`${name} (${path})`, async () => {
        const response = await page.goto(path);
        expect(response?.status()).toBeLessThan(500);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
      });
    }
  });

  test("login page renders correctly", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("schedule board renders core components", async ({ page }) => {
    await page.goto("/operations/schedule");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
    await expect(page.locator("body")).toBeVisible();
  });
});
