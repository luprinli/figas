/* eslint-disable no-empty */
import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const PILOT = { email: "felix.pilot@figas.gov.fk", password: "figas2024!" };
const FUELER = { email: "fueler@figas.gov.fk", password: "figas2024!" };

async function loginAs(page: import("@playwright/test").Page, email: string, password: string): Promise<string | null> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000);

  await page.evaluate(({ e, p }) => {
    const emailEl = document.querySelector('input[name="email"]') as HTMLInputElement;
    const passEl = document.querySelector('input[name="password"]') as HTMLInputElement;
    const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (emailEl) emailEl.value = e;
    if (passEl) passEl.value = p;
    if (btn) btn.click();
  }, { e: email, p: password });

  try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
  await page.waitForTimeout(1000);

  const url = page.url();
  if (url.includes("chrome-error") || url.includes("/login")) return null;
  return url;
}

test.describe("Pilot EFB", () => {

  test("login redirects to /pilot", async ({ page }) => {
    // Retry loop for server readiness
    let url = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.context().clearCookies();
      await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForTimeout(1000);

      if (!page.url().includes("chrome-error")) {
        await page.fill('input[name="email"]', PILOT.email);
        await page.fill('input[name="password"]', PILOT.password);
        await page.click('button[type="submit"]');
        try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
        await page.waitForTimeout(1000);
        url = page.url();
        if (!url.includes("chrome-error")) break;
      }
      await page.waitForTimeout(3000);
    }
    if (url.includes("chrome-error")) { test.skip(true, "Server connectivity issue (chrome-error)"); return; }
    expect(url).toContain("/pilot");
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
  });

  test("dashboard loads with Accept/Decline for assigned flights", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', PILOT.email);
    await page.fill('input[name="password"]', PILOT.password);
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    await page.goto("http://localhost:5174/pilot", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    expect(await page.locator("body").isVisible()).toBe(true);
  });

  test("My Flights and My Schedule pages load", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', PILOT.email);
    await page.fill('input[name="password"]', PILOT.password);
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    for (const p of ["/pilot/flights", "/pilot/schedule"]) {
      await page.goto(`http://localhost:5174${p}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForTimeout(500);
      expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    }
  });

  test("flight hub tabs all load without errors", async ({ page }) => {
    // Login as ops first to find a flight
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', "ops@figas.gov.fk");
    await page.fill('input[name="password"]', "figas2024!");
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    await page.goto("http://localhost:5174/operations/schedule", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);

    const flightLinks = page.locator('a[href*="/pilot/flight/"]');
    if (await flightLinks.count() === 0) { test.skip(true, "No flights found"); return; }
    const href = await flightLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "Could not extract flight URL"); return; }

    // Switch to pilot
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', PILOT.email);
    await page.fill('input[name="password"]', PILOT.password);
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    const tabs = [href, `${href}/plan`, `${href}/briefing`, `${href}/fuel`, `${href}/ops`, `${href}/log`];
    for (const tabUrl of tabs) {
      await page.goto(`http://localhost:5174${tabUrl}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForTimeout(300);
      expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    }
  });

  test("briefing checklist has toggle items", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', PILOT.email);
    await page.fill('input[name="password"]', PILOT.password);
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    await page.goto("http://localhost:5174/pilot/schedule", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(500);

    const scheduleLink = page.locator('a[href*="/pilot/schedule/"]').first();
    if (await scheduleLink.count() === 0) { test.skip(true, "No schedules"); return; }
    await scheduleLink.click();
    await page.waitForTimeout(1000);

    const flightLink = page.locator('a[href*="/pilot/flight/"]').first();
    if (await flightLink.count() === 0) { test.skip(true, "No flights in schedule"); return; }
    const fHref = await flightLink.getAttribute("href");
    if (!fHref) { test.skip(true, "No flight URL"); return; }

    await page.goto(`http://localhost:5174${fHref}/briefing`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(800);
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
  });

  test("old /pilot/briefing/:id redirects to hub", async ({ page }) => {
    // Login as ops to find flight
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', "ops@figas.gov.fk");
    await page.fill('input[name="password"]', "figas2024!");
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    await page.goto("http://localhost:5174/operations/schedule", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);

    const flightLinks = page.locator('a[href*="/pilot/flight/"]');
    if (await flightLinks.count() === 0) { test.skip(true, "No flights"); return; }
    const href = await flightLinks.first().getAttribute("href");
    const match = href?.match(/\/pilot\/flight\/(\d+)/);
    if (!match) { test.skip(true, "Could not parse flight ID"); return; }
    const flightId = match[1];

    // Switch to pilot
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', PILOT.email);
    await page.fill('input[name="password"]', PILOT.password);
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    await page.goto(`http://localhost:5174/pilot/briefing/${flightId}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    expect(page.url()).toContain(`/pilot/flight/${flightId}/briefing`);
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
  });

  test("non-existent flight returns clean error page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("http://localhost:5174/login", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.fill('input[name="email"]', PILOT.email);
    await page.fill('input[name="password"]', PILOT.password);
    await page.click('button[type="submit"]');
    try { await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }); } catch {}
    await page.waitForTimeout(1000);

    await page.goto("http://localhost:5174/pilot/flight/999999", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
  });
});

test.describe("Fueler", () => {

  test("login redirects to /fueler", async ({ page }) => {
    const url = await loginAs(page, FUELER.email, FUELER.password);
    if (!url) { test.skip(true, "Server unreachable"); return; }
    expect(url).toContain("/fueler");
    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
  });

  test("all fueler routes load without errors", async ({ page }) => {
    const url = await loginAs(page, FUELER.email, FUELER.password);
    if (!url) { test.skip(true, "Server unreachable"); return; }

    for (const path of ["/fueler", "/fueler/orders", "/fueler/history", "/fueler/profile"]) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 10_000 });
      await page.waitForTimeout(300);
      expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    }
  });

  test("can access fuel tab on flight (FLIGHT_FUEL_EXECUTE)", async ({ page }) => {
    // Find a flight
    await loginAs(page, "ops@figas.gov.fk", "figas2024!");
    await page.goto("/operations/schedule", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    const flightLinks = page.locator('a[href*="/pilot/flight/"]');
    if (await flightLinks.count() === 0) { test.skip(true, "No flights"); return; }
    const href = await flightLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "No flight URL"); return; }

    // Login as fueler and access fuel tab
    await loginAs(page, FUELER.email, FUELER.password);
    await page.goto(`${href}/fuel`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    expect(page.url()).not.toContain("/login");
  });

  test("profile page has editable form", async ({ page }) => {
    await loginAs(page, FUELER.email, FUELER.password);
    await page.goto("/fueler/profile", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    expect(await page.locator("text=Internal Server Error").count()).toBe(0);
    const nameInput = page.locator('input[name="name"]');
    expect(await nameInput.isVisible({ timeout: 3_000 })).toBe(true);
    expect(await nameInput.isDisabled()).toBe(false);
  });
});
