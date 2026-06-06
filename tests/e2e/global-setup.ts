import { chromium } from "@playwright/test";

/**
 * Global setup for Playwright e2e tests.
 * Logs in as operations user and saves the authenticated session state
 * so individual tests can start already authenticated.
 */
async function globalSetup() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to login page
    await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });

    // Fill in operations user credentials (has schedule:create permission)
    await page.fill('input[name="email"]', "ops@figas.gov.fk");
    await page.fill('input[name="password"]', "figas2024!");

    // Submit the login form
    await page.click('button[type="submit"]');

    // Wait for navigation away from login page (redirect to /operations)
    // Use a function-based wait to check URL doesn't contain /login
    await page.waitForURL(
      (url) => !url.pathname.includes("/login"),
      { timeout: 15_000 }
    );

    // Verify we're actually logged in by checking for session cookie
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "session" || c.name.includes("session"));
    if (!sessionCookie) {
      console.warn("Warning: No session cookie found after login. Auth state may be incomplete.");
      console.log("Cookies found:", cookies.map((c) => c.name).join(", "));
    }

    // Save the authenticated state (cookies + localStorage)
    await context.storageState({ path: "tests/e2e/auth-state.json" });
    console.log("Global setup complete. Auth state saved.");
  } catch (error) {
    console.error("Global setup failed:", error);
    // Save whatever state we have so tests can still try
    await context.storageState({ path: "tests/e2e/auth-state.json" });
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
