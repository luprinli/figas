import { test, expect } from "@playwright/test";

test.setTimeout(120_000);

const USERS = [
  { email: "admin@figas.gov.fk",        password: "figas2024!", role: "admin" },
  { email: "felix.pilot@figas.gov.fk",  password: "figas2024!", role: "pilot" },
  { email: "oscar.pilot@figas.gov.fk",  password: "figas2024!", role: "pilot" },
  { email: "ops@figas.gov.fk",          password: "figas2024!", role: "operations" },
  { email: "engineer@figas.gov.fk",     password: "figas2024!", role: "engineer" },
  { email: "passenger@figas.gov.fk",    password: "figas2024!", role: "passenger" },
  { email: "checkin@figas.gov.fk",      password: "figas2024!", role: "checkin" },
  { email: "finance@figas.gov.fk",      password: "figas2024!", role: "finance" },
];

test.describe("Login verification — all .env users", () => {
  for (const user of USERS) {
    test(`should login as ${user.role} (${user.email})`, async ({ page }) => {
      const log = (msg: string) => console.log(`[${user.role}] ${msg}`);

      // Clear any existing session and navigate fresh
      await page.context().clearCookies();
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15_000 });
      await page.waitForTimeout(500);

      // Use evaluate to reliably fill and submit (bypasses event handler issues)
      await page.evaluate(({ email, password }) => {
        const e = document.querySelector('input[name="email"], input[type="email"]') as HTMLInputElement;
        const p = document.querySelector('input[name="password"], input[type="password"]') as HTMLInputElement;
        const b = document.querySelector('button[type="submit"]') as HTMLButtonElement;
        if (e) e.value = email;
        if (p) p.value = password;
        if (b) b.click();
      }, { email: user.email, password: user.password });
      log("Submitted via evaluate");

      // Wait for navigation to complete (either via Remix router or window.location)
      try {
        await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });
      } catch {
        log("waitForURL timeout — checking page state");
      }
      await page.waitForTimeout(500);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => log("networkidle timeout"));
      await page.waitForTimeout(500);
      const finalUrl = page.url();
      log(`Login result — URL: ${finalUrl}`);

      // Verify we're NOT on the login page (should be redirected to role home)
      expect(finalUrl).not.toContain("/login");
      expect(finalUrl).not.toContain("status=error");
      expect(finalUrl).not.toContain("chrome-error");
      expect(finalUrl).toMatch(/^https?:\/\//);

      // Verify no error messages on page
      const errorText = page.locator("text=Invalid credentials")
        .or(page.locator("text=Login failed"))
        .or(page.locator("text=Wrong password"))
        .or(page.locator("text=User not found"));
      await expect(errorText).toHaveCount(0, { timeout: 3_000 });

      log(`SUCCESS — logged in as ${user.role}`);
    });
  }
});
