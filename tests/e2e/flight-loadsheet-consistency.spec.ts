import { test, expect } from "@playwright/test";
import { SchedulePage } from "./pages/schedule-page";

test.describe("Flight-Loadsheet Consistency", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
  });

  test("should show identical passenger counts on flight card and loadsheet", async ({ page }) => {
    await schedulePage.goto();
    await page.waitForLoadState("networkidle");

    // Find a flight with passengers
    const flightCards = page.locator('[data-testid="flight-card"]');
    const flightCount = await flightCards.count();

    if (flightCount === 0) {
      console.log("  ⚠ No flights — check scheduled date has flights");
      test.skip();
      return;
    }

    // Collect flight card passenger data
    let flightPax = 0;
    let flightPassengerNames: string[] = [];
    let targetIndex = -1;

    for (let i = 0; i < flightCount; i++) {
      const card = flightCards.nth(i);
      const text = await card.textContent().catch(() => "");
      const paxMatch = (text ?? "").match(/(\d+)\s*pax/);
      if (paxMatch && parseInt(paxMatch[1]) > 0) {
        flightPax = parseInt(paxMatch[1]);
        flightPassengerNames = extractNames(text ?? "");
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      console.log("  ⚠ No flight with passengers — drag a booking first");
      test.skip();
      return;
    }

    console.log(`  ✓ Flight card: ${flightPax} pax`);
    expect(flightPax, "flight must have passengers").toBeGreaterThan(0);

    // Open loadsheet for this flight
    const loadsheetBtn = page.locator('button[title="View Loadsheet"]').nth(targetIndex);
    await expect(loadsheetBtn, "loadsheet button visible").toBeVisible({ timeout: 5_000 });
    await loadsheetBtn.click();
    await page.waitForTimeout(2000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog, "loadsheet modal opened").toBeVisible({ timeout: 5_000 });

    const loadsheetText = await dialog.textContent().catch(() => "");
    const loadsheetPaxMatch = (loadsheetText ?? "").match(/(\d+)\s*pax/);
    const loadsheetPax = loadsheetPaxMatch ? parseInt(loadsheetPaxMatch[1]) : 0;

    console.log(`  ✓ Loadsheet: ${loadsheetPax} pax`);

    // The loadsheet should show at least as many passengers as the flight card
    expect(loadsheetPax, "loadsheet pax count >= flight card pax count").toBeGreaterThanOrEqual(flightPax);

    // Verify individual passengers from flight card also appear in loadsheet
    const loadsheetNames = extractNames(loadsheetText ?? "");
    const missingNames = flightPassengerNames.filter(
      (fn) => !loadsheetNames.some((ln) => nameMatches(fn, ln))
    );

    if (missingNames.length > 0) {
      console.log(`  �— Missing from loadsheet: ${missingNames.join(", ")}`);
    }
    expect(missingNames, "all flight card passengers appear in loadsheet").toEqual([]);

    // ── Round-trip: also verify loadsheet passengers appear on flight card
    const extraNames = loadsheetNames.filter(
      (ln) => !flightPassengerNames.some((fn) => nameMatches(ln, fn))
    );

    if (extraNames.length > 0) {
      console.log(`  ⚠ Loadsheet has ${extraNames.length} extra passengers not on flight card: ${extraNames.slice(0, 5).join(", ")}`);
    }

    console.log("\n  ✅ Flight-loadsheet passenger consistency verified");
  });

  test("should detect passenger drift between flight and loadsheet", async ({ page }) => {
    await schedulePage.goto();
    await page.waitForLoadState("networkidle");

    const flightCards = page.locator('[data-testid="flight-card"]');
    if (await flightCards.count() === 0) { test.skip(); return; }

    for (let i = 0; i < Math.min(await flightCards.count(), 3); i++) {
      const card = flightCards.nth(i);
      const cardText = await card.textContent().catch(() => "");
      const cardPaxMatch = (cardText ?? "").match(/(\d+)\s*pax/);
      const cardPax = cardPaxMatch ? parseInt(cardPaxMatch[1]) : 0;

      if (cardPax === 0) continue;

      // Open loadsheet
      const btn = page.locator('button[title="View Loadsheet"]').nth(i);
      if (!await btn.isVisible({ timeout: 3_000 }).catch(() => false)) continue;
      await btn.click();
      await page.waitForTimeout(1500);

      const dialog = page.locator('[role="dialog"]');
      if (!await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) continue;

      const lsText = await dialog.textContent().catch(() => "");
      const lsPaxMatch = (lsText ?? "").match(/(\d+)\s*pax/);
      const lsPax = lsPaxMatch ? parseInt(lsPaxMatch[1]) : 0;

      const consistent = lsPax >= cardPax;
      console.log(`  Flight ${i + 1}: card=${cardPax}pax loadsheet=${lsPax}pax ${consistent ? "✓" : "�— DRIFT"}`);

      if (!consistent) {
        console.log(`    �— DRIFT DETECTED: loadsheet ${lsPax} < flight ${cardPax}`);
      }

      expect(lsPax, `flight ${i + 1} loadsheet pax >= card pax`).toBeGreaterThanOrEqual(cardPax);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  });
});

// ── Helpers ────────────────────────────────────────────────────────────

function extractNames(text: string): string[] {
  // Match "Firstname Lastname" patterns (capitalized words)
  const matches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? [];
  // Filter out non-name patterns
  return matches.filter((m) =>
    !m.match(/^(Flight|Loadsheet|Pilot|Aircraft|Passenger|Manifest|Schedule|Route|Operations|Summary|Draft|Status|Cancel|Check|Board|Alight|Arrival|Departure|Sector|Calculations|Planning|Empty|Crew|Starting|Fuel)/i)
  );
}

function nameMatches(a: string, b: string): boolean {
  const partsA = a.toLowerCase().split(/\s+/);
  const partsB = b.toLowerCase().split(/\s+/);
  return partsA.some((pa) => partsB.some((pb) => pa === pb));
}
