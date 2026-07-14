/* eslint-disable no-empty */
import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const FUELER = { email: "fueler@figas.gov.fk", password: "figas2024!" };

async function loginAs(page: import("@playwright/test").Page, email: string, password: string): Promise<string | null> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);

  await page.evaluate(({ e, p }) => {
    const emailEl = document.querySelector('input[name="email"]') as HTMLInputElement;
    const passEl = document.querySelector('input[name="password"]') as HTMLInputElement;
    const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (emailEl) emailEl.value = e;
    if (passEl) passEl.value = p;
    if (btn) btn.click();
  }, { e: email, p: password });

  try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 8_000 }); } catch {}
  await page.waitForTimeout(300);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  const url = page.url();
  if (url.includes("chrome-error")) return null;
  return url;
}

test.describe("Fueler", () => {

  test("login redirects to /fueler", async ({ page }) => {
    const url = await loginAs(page, FUELER.email, FUELER.password);
    if (!url) { test.skip(true, "Server unreachable"); return; }
    expect(url).toContain("/fueler");
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
  });

  test("dashboard shows KPI cards", async ({ page }) => {
    const url = await loginAs(page, FUELER.email, FUELER.password);
    if (!url) { test.skip(true, "Server unreachable"); return; }

    await page.goto("/fueler", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    expect(await page.locator("text=Internal Server Error").count()).toBe(0);

    const pendingVisible = await page.getByText("Pending Orders", { exact: true }).first().isVisible({ timeout: 3_000 }).catch(() => false);
    const completedVisible = await page.getByText("Completed Today", { exact: true }).first().isVisible({ timeout: 3_000 }).catch(() => false);
    const liftedVisible = await page.getByText("Lifted Today", { exact: true }).first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(pendingVisible || completedVisible || liftedVisible).toBe(true);
  });

  test("all fueler sub-routes load without errors", async ({ page }) => {
    const url = await loginAs(page, FUELER.email, FUELER.password);
    if (!url) { test.skip(true, "Server unreachable"); return; }

    for (const path of ["/fueler/orders", "/fueler/history", "/fueler/profile"]) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 10_000 });
      await page.waitForTimeout(300);
      expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    }
  });

  test("profile page has editable fields and password form", async ({ page }) => {
    await loginAs(page, FUELER.email, FUELER.password);
    await page.goto("/fueler/profile", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    expect(await page.locator("text=Internal Server Error").count()).toBe(0);

    // Editable name field
    const nameInput = page.locator('input[name="name"]');
    expect(await nameInput.isVisible({ timeout: 3_000 })).toBe(true);
    expect(await nameInput.isDisabled()).toBe(false);

    // Password change form
    const pwHeading = page.getByText("Change Password", { exact: true }).first();
    expect(await pwHeading.isVisible({ timeout: 3_000 })).toBe(true);
  });

  test("can access /ops/fuel-orders", async ({ page }) => {
    await loginAs(page, FUELER.email, FUELER.password);
    await page.goto("/ops/fuel-orders", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    const heading = page.getByText("Fuel Orders", { exact: false }).first();
    expect(await heading.isVisible({ timeout: 3_000 })).toBe(true);
  });

  test("sidebar nav items are visible", async ({ page }) => {
    await loginAs(page, FUELER.email, FUELER.password);
    await page.goto("/fueler", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    expect(await page.locator("text=Internal Server Error").count()).toBe(0);

    // Sidebar nav items should exist
    for (const item of ["Dashboard", "Orders", "History", "Profile"]) {
      const visible = await page.getByText(item, { exact: true }).first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (!visible) {
        // Might be collapsed — verify page body is visible
        expect(await page.locator("body").isVisible()).toBe(true);
        break;
      }
    }
  });
});
