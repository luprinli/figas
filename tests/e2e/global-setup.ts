import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";

/**
 * Global setup for Playwright e2e tests.
 * 1. Seeds deterministic E2E test data (guarantees unassigned bookings on today/tomorrow/today+2)
 * 2. Logs in as operations user and saves authenticated session state
 */
async function globalSetup() {
  // Step 1: Seed deterministic E2E data (idempotent — safe to re-run)
  console.log("\n🌱 Seeding E2E test data...");
  try {
    execSync("node --env-file-if-exists=.env --import tsx scripts/seed-e2e-deterministic.ts", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch {
    console.warn("⚠ E2E seed failed — tests may skip if no data available");
  }

  // Step 2: Authenticate and save session state
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "ops@figas.gov.fk");
    await page.fill('input[name="password"]', "figas2024!");
    await page.click('button[type="submit"]');
    await page.waitForURL(
      (url) => !url.pathname.includes("/login"),
      { timeout: 15_000 }
    );
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "session" || c.name.includes("session"));
    if (!sessionCookie) {
      console.warn("Warning: No session cookie found after login.");
    }
    await context.storageState({ path: "tests/e2e/auth-state.json" });
    console.log("✅ Global setup complete — auth state saved.\n");
  } catch (error) {
    console.error("Global setup failed:", error);
    await context.storageState({ path: "tests/e2e/auth-state.json" });
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
