import { test } from "@playwright/test";

test("login then navigate to /pilot", async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  // Login as pilot
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const e = document.querySelector('input[name="email"], input[type="email"]') as HTMLInputElement;
    const p = document.querySelector('input[name="password"], input[type="password"]') as HTMLInputElement;
    const b = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (e) e.value = "felix.pilot@figas.gov.fk";
    if (p) p.value = "figas2024!";
    if (b) b.click();
  });

  await page.waitForTimeout(3000);
  console.log(`After login: ${page.url()}`);

  // Manual navigation to /pilot
  await page.goto("/pilot", { waitUntil: "networkidle", timeout: 10_000 });
  await page.waitForTimeout(1000);
  console.log(`After /pilot goto: ${page.url()}`);

  const body = await page.locator("body").textContent().catch(() => "");
  console.log(`Page title: ${body?.slice(0, 100)}`);

  await context.close();
});
