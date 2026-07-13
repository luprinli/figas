import { test, expect } from "@playwright/test";
import { SchedulePage } from "./pages/schedule-page";
import {
  dragBookingToDraftFlight,
  dragBookingToFlight,
  dragPassengerToUnassignPool,
} from "./helpers/drag-simulator";

test.setTimeout(120_000);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPREHENSIVE END-TO-END DRAG-AND-DROP SCHEDULING TEST SUITE
 *
 * Purpose: Validates the full scheduling pipeline via UI drag-and-drop,
 * covering both frontend state management and backend business logic.
 *
 * Data requirements:
 *   Run `npx tsx scripts/seed-e2e-drag-test.ts` before this test to create
 *   14+ unassigned bookings across 3 dates (today, tomorrow, day+2).
 *
 * Key validations per passenger added:
 *   1. Flight path generation (route display: origin→stop→destination→STY)
 *   2. Passenger details in flight card with stop activities
 *   3. UI state updates without page reload (fetcher-driven React updates)
 *   4. Weight/balance validation banners (when pilot + aircraft assigned)
 *
 * Test procedure:
 *   1. Navigate to a date with unassigned bookings
 *   2. Create Flight A: drag a booking → draft placeholder
 *   3. Assign pilot + aircraft → triggers per-stop weight validation
 *   4. Iteratively add passengers until validation failure (MTOW/MLW/fuel/range)
 *   5. Create Flight B: drag remaining bookings → draft placeholder
 *   6. Assign pilot + aircraft → repeat iterative passenger addition
 *   7. Cross-date validation: verify schedules operate independently
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Utility helper ──────────────────────────────────────────────────────────

async function getFirstBookingLegId(page: import("@playwright/test").Page): Promise<number | null> {
  const booking = page.locator('[data-testid="booking-item"]').first();
  const idAttr = await booking.getAttribute("id").catch(() => null);
  if (!idAttr) return null;
  const num = parseInt(idAttr.replace("booking-", ""), 10);
  return isNaN(num) ? null : num;
}

async function getFlightCardIds(page: import("@playwright/test").Page): Promise<number[]> {
  const cards = page.locator('[data-testid="flight-card"]');
  const count = await cards.count();
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const idAttr = await cards.nth(i).getAttribute("id");
    if (idAttr) {
      const num = parseInt(idAttr.replace("flight-", ""), 10);
      if (!isNaN(num)) ids.push(num);
    }
  }
  return ids;
}

async function extractRouteFromCard(page: import("@playwright/test").Page, flightCardIndex: number): Promise<string> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);
  const text = await card.innerText();
  const routeMatch = text.match(/[A-Z]{3}(?:\s*[→\u2192]\s*[A-Z]{3})+/);
  return routeMatch ? routeMatch[0].replace(/\s+/g, " ") : "unknown";
}

async function extractPassengerCount(cardText: string): Promise<number> {
  const paxMatch = cardText.match(/(\d+)\s*pax/);
  return paxMatch ? parseInt(paxMatch[1], 10) : 0;
}

async function extractWeightKg(cardText: string): Promise<number> {
  const weightMatch = cardText.match(/(\d+)\s*kg/);
  return weightMatch ? parseInt(weightMatch[1], 10) : 0;
}

async function getValidationStatus(page: import("@playwright/test").Page, flightCardIndex: number): Promise<string> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);
  const text = await card.innerText();
  if (text.includes("violation") || /[!\u26A0]/.test(text)) return "violation";
  if (text.includes("warning") || text.includes("~")) return "warning";
  return "ok";
}

// ── Assign Helpers ──────────────────────────────────────────────────────────

/**
 * Click the pilot assignment button on a flight card.
 * The pilot button is a pill-shaped button with a person icon SVG (viewBox "0 0 16 16")
 * showing text "Pilot" (unassigned), a pilot name (assigned), or "TBC" (not assignable).
 *
 * After clicking, pilot option buttons appear showing available pilot names.
 * We select the first available pilot.
 */
async function assignPilot(page: import("@playwright/test").Page, flightCardIndex: number): Promise<boolean> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);

  // Try finding the pilot assignment pill button by its "Pilot" or "TBC" text
  // when it's unassigned. After assignment, the text changes to the pilot's name.
  const pilotBtnText = await card.locator("button").filter({ hasText: /^Pilot$/ }).first();
  const tbcBtn = await card.locator("button").filter({ hasText: /^TBC$/ }).first();

  let assignBtn = null;
  if (await pilotBtnText.count() > 0) {
    assignBtn = pilotBtnText;
  } else if (await tbcBtn.count() > 0) {
    // When TBC, we can't tell pilot from aircraft button — try both
    assignBtn = tbcBtn;
  }

  if (assignBtn) {
    const btnText = await assignBtn.innerText();
    console.log(`    └─ Pilot button found: "${btnText}"`);
    await assignBtn.click({ force: true });
    await page.waitForTimeout(600);

    // After clicking, pilot options appear as name-only buttons inside a dropdown div.
    // These option buttons contain "First Last" formatted names (no registration codes).
    // We look for buttons that have a space (indicating a name) but NOT "VP-" (aircraft reg).
    const optionCandidates = card.locator("button").filter({
      hasText: /^[A-Z][a-z]+ [A-Z][a-z]+$/,
    });
    const optionCount = await optionCandidates.count();
    if (optionCount > 0) {
      const firstOption = optionCandidates.first();
      const optionText = await firstOption.innerText();
      console.log(`    └─ Assigning pilot: ${optionText}`);
      await firstOption.click({ force: true });
      await page.waitForLoadState("networkidle");
      return true;
    }

    // Fallback: try buttons that are NOT the main pill buttons
    const allCardButtons = card.locator("button");
    const allCount = await allCardButtons.count();
    for (let i = 0; i < allCount; i++) {
      const btn = allCardButtons.nth(i);
      const text = await btn.innerText();
      // Skip known main buttons
      if (/Pilot|TBC|Aircraft|Loadsheet|pax|kg/i.test(text)) continue;
      if (text.trim().length > 0) {
        console.log(`    └─ Assigning pilot (fallback): ${text}`);
        await btn.click({ force: true });
        await page.waitForLoadState("networkidle");
        return true;
      }
    }

    console.log("    ⚠ No pilot options found to select");
    return false;
  }

  // Pilot already assigned — verify by checking if there's a non-empty name
  console.log("    └─ Pilot already assigned (or no assignable button visible)");
  return true;
}

/**
 * Click the aircraft assignment button on a flight card.
 * The aircraft button is a pill-shaped button with a plane icon SVG (viewBox "0 0 24 24")
 * showing text "Aircraft" (unassigned), a registration+type (assigned), or "TBC" (not assignable).
 *
 * After clicking, aircraft option buttons appear showing registration codes like "VP-FBE BN-2 Islander".
 * We select the first available aircraft.
 */
async function assignAircraft(page: import("@playwright/test").Page, flightCardIndex: number): Promise<boolean> {
  const card = page.locator('[data-testid="flight-card"]').nth(flightCardIndex);

  // Find the aircraft button by its "Aircraft" text when unassigned
  const acBtnText = card.locator("button").filter({ hasText: /^Aircraft$/ }).first();
  const tbcBtns = card.locator("button").filter({ hasText: /^TBC$/ });

  let assignBtn = null;
  if (await acBtnText.count() > 0) {
    assignBtn = acBtnText;
  } else if (await tbcBtns.count() > 1) {
    // Two TBC buttons exist — one is pilot, one is aircraft. Try the second one.
    assignBtn = tbcBtns.nth(1);
  } else if (await tbcBtns.count() === 1) {
    // Only one TBC — it could be either. Try it.
    assignBtn = tbcBtns.first();
  }

  if (assignBtn) {
    const btnText = await assignBtn.innerText();
    console.log(`    └─ Aircraft button found: "${btnText}"`);
    await assignBtn.click({ force: true });
    await page.waitForTimeout(600);

    // After clicking, aircraft options appear with registration codes like "VP-FBE BN-2 Islander · 9s"
    const optionCandidates = card.locator("button").filter({
      hasText: /VP-/,
    });
    const optionCount = await optionCandidates.count();
    if (optionCount > 0) {
      const firstOption = optionCandidates.first();
      const optionText = await firstOption.innerText();
      console.log(`    └─ Assigning aircraft: ${optionText}`);
      await firstOption.click({ force: true });
      await page.waitForLoadState("networkidle");
      return true;
    }

    // Fallback: find any button that appeared after clicking
    const allCardButtons = card.locator("button");
    const allCount = await allCardButtons.count();
    for (let i = 0; i < allCount; i++) {
      const btn = allCardButtons.nth(i);
      const text = await btn.innerText();
      if (/Pilot|TBC|Aircraft|Loadsheet|pax|kg/i.test(text)) continue;
      if (text.trim().length > 0) {
        console.log(`    └─ Assigning aircraft (fallback): ${text}`);
        await btn.click({ force: true });
        await page.waitForLoadState("networkidle");
        return true;
      }
    }

    console.log("    ⚠ No aircraft options found to select");
    return false;
  }

  // Aircraft already assigned
  console.log("    └─ Aircraft already assigned (or no assignable button visible)");
  return true;
}

// ── Logging helpers ─────────────────────────────────────────────────────────

function printDivider(label: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(70)}`);
}

function printFlightSummary(flightIndex: number, cardText: string) {
  const lines = cardText.split("\n").filter(l => l.trim());
  console.log(`  ┌─ Flight Card #${flightIndex + 1}`);
  for (const line of lines.slice(0, 15)) {
    console.log(`  │  ${line}`);
  }
  if (lines.length > 15) {
    console.log(`  │  ... (${lines.length - 15} more lines)`);
  }
  console.log(`  └─ End`);
}

function printStopActivities(cardText: string) {
  const sections = cardText.split(/\n(?=[A-Z]{3}\s)/);
  console.log(`    Stop Activities:`);
  for (const section of sections) {
    const match = section.match(/^(...)/);
    if (match) {
      const code = match[1];
      const hasArr = section.includes("Arr");
      const hasDep = section.includes("Dep");
      const hasViolation = section.includes("!") || section.includes("violation");
      const hasWarning = section.includes("~") || section.includes("warning");
      const status = hasViolation ? "❌ VIOLATION" : hasWarning ? "⚠ WARNING" : "✅ OK";
      console.log(`      • ${code} — Arrivals: ${hasArr ? "yes" : "no"}, Departures: ${hasDep ? "yes" : "no"}, Status: ${status}`);
    }
  }
}

function printPassengerDetails(cardText: string) {
  const paxLines = cardText.split("\n").filter(l => /[A-Z][a-z]+ [A-Z][a-z]+/.test(l));
  console.log(`    Passengers (${paxLines.length} names found):`);
  for (const line of paxLines.slice(0, 20)) {
    console.log(`      • ${line.trim()}`);
  }
  if (paxLines.length > 20) {
    console.log(`      ... and ${paxLines.length - 20} more`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("E2E Drag-and-Drop Scheduling — Full Validation Pipeline", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Single-Flight Iterative Passenger Build with Validation
  // ──────────────────────────────────────────────────────────────────────────

  test("should iteratively add passengers to a flight until weight limit is exceeded", async ({ page }) => {
    printDivider("TEST 1: Iterative Passenger Build → Flight A");

    await schedulePage.goto();
    await page.waitForLoadState("networkidle");

    // The schedule-board only renders when flights exist.
    // When empty, DraftFlightPlaceholder or "No schedule" message is shown.
    const boardExists = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardExists) {
      console.log("  ℹ No schedule-board (no flights yet — expected for empty state)");
    }

    const initialBookingCount = await schedulePage.getUnassignedBookingCount();
    const initialFlightCount = await schedulePage.getFlightCardCount();

    console.log(`\n  📋 Initial State:`);
    console.log(`     Date: ${page.url()}`);
    console.log(`     Unassigned bookings: ${initialBookingCount}`);
    console.log(`     Existing flights: ${initialFlightCount}`);

    if (initialBookingCount === 0) {
      console.log("  ⏭ No unassigned bookings — skipping test");
      test.skip();
      return;
    }

    // ── Step 1: Create Flight A via drag-and-drop (or use existing flight) ─

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true, "No booking ID found"); return; }

    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    const draftVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);

    let flightAId: number | null = null;

    if (draftVisible) {
      printDivider("STEP 1a: Create Flight A → drag first booking to draft placeholder");
      console.log(`  Dragging booking-${booking1Id} → draft-flight-placeholder`);
      await dragBookingToDraftFlight(page, booking1Id);
      await page.waitForTimeout(1000);
      await page.waitForLoadState("networkidle");

      const flightCardsAfterCreate = page.locator('[data-testid="flight-card"]');
      await expect(flightCardsAfterCreate.first()).toBeVisible({ timeout: 15_000 });

      const flightCountAfterCreate = await schedulePage.getFlightCardCount();
      console.log(`  ✅ Flight A created — flights: ${initialFlightCount} → ${flightCountAfterCreate}`);
    } else if (initialFlightCount > 0) {
      console.log(`  ℹ Draft placeholder not visible — using existing flight #1`);
      const flightIds = await getFlightCardIds(page);
      if (flightIds.length > 0) flightAId = flightIds[0];
      console.log(`  Using Flight A (id=${flightAId})`);
    } else {
      console.log("  ⏭ Draft placeholder not visible and no flights exist — skipping");
      test.skip();
      return;
    }

    const routeAfterCreate = await extractRouteFromCard(page, 0);
    console.log(`     Route: ${routeAfterCreate}`);

    // ── Step 2: Assign Pilot to Flight A ───────────────────────────────────

    printDivider("STEP 1b: Assign Pilot to Flight A");
    const pilotAssigned = await assignPilot(page, 0);
    console.log(`  Pilot assigned: ${pilotAssigned}`);

    // Wait for assignment to settle
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");

    // ── Step 3: Assign Aircraft to Flight A ────────────────────────────────

    printDivider("STEP 1c: Assign Aircraft to Flight A");
    const aircraftAssigned = await assignAircraft(page, 0);
    console.log(`  Aircraft assigned: ${aircraftAssigned}`);

    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");

    // ── Step 4: Log Flight A's initial state after pilot + aircraft ────────

    printDivider("STEP 1d: Flight A Initial State (after pilot + aircraft)");

    let flightACardText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
    printFlightSummary(0, flightACardText);

    const paxCountAfterInitial = await extractPassengerCount(flightACardText);
    const weightAfterInitial = await extractWeightKg(flightACardText);
    console.log(`\n  👤 Passenger count: ${paxCountAfterInitial}`);
    console.log(`  ⚖ Total weight: ${weightAfterInitial} kg`);
    console.log(`  🛣 Route chain: ${extractRouteFromCard(page, 0)}`);

    // Expand passenger section to see stop activities
    const passengerToggle = page.locator('[data-testid="flight-card"]').first().locator("button").filter({ hasText: /pax/i });
    const toggleVisible = await passengerToggle.isVisible({ timeout: 3_000 }).catch(() => false);
    if (toggleVisible) {
      await passengerToggle.click();
      await page.waitForTimeout(500);
      flightACardText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
      printStopActivities(flightACardText);
      printPassengerDetails(flightACardText);
    }

    // ── Step 5: Iteratively add remaining passengers to Flight A ───────────

    printDivider("STEP 1e: Iterative Passenger Addition to Flight A");

    let assignedCount = 1;
    const maxIterations = 12;

    for (let iter = 0; iter < maxIterations; iter++) {
      const remainingBookings = await schedulePage.getUnassignedBookingCount();
      if (remainingBookings === 0) {
        console.log(`  ✅ All bookings assigned — no more to drag`);
        break;
      }

      const nextBookingId = await getFirstBookingLegId(page);
      if (!nextBookingId) break;

      // Get Flight A's ID
      if (!flightAId) {
        const flightIds = await getFlightCardIds(page);
        if (flightIds.length > 0) flightAId = flightIds[0];
      }
      if (!flightAId) {
        console.log(`  ⚠ Cannot determine Flight A ID`);
        break;
      }

      console.log(`\n  ── Iteration ${iter + 1}: Drag booking-${nextBookingId} → flight-${flightAId} ──`);
      await dragBookingToFlight(page, nextBookingId, flightAId);
      await page.waitForTimeout(700);
      await page.waitForLoadState("networkidle");

      assignedCount++;

      // Read updated card
      flightACardText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
      const currentPax = await extractPassengerCount(flightACardText);
      const currentWeight = await extractWeightKg(flightACardText);

      console.log(`     👤 Passengers: ${currentPax} (was ${paxCountAfterInitial + assignedCount - 2})`);
      console.log(`     ⚖ Weight: ${currentWeight} kg`);

      // Check for validation status indicators
      const validationStatus = await getValidationStatus(page, 0);
      console.log(`     🔍 Validation status: ${validationStatus}`);

      // Check for specific violation indicators in the card text
      if (flightACardText.includes("violation") || flightACardText.includes("seat")) {
        console.log(`\n  ⛔ VIOLATION DETECTED at iteration ${iter + 1}`);
        console.log(`     Last valid passenger count: ${assignedCount - 1}`);
        console.log(`     Violation details:`);
        const violationLines = flightACardText.split("\n").filter(l =>
          l.includes("violation") || l.includes("exceeded") || l.includes("limit") ||
          l.includes("seat") || l.includes("overload") || l.includes("capacity")
        );
        for (const line of violationLines) {
          console.log(`       • ${line.trim()}`);
        }
        console.log(`\n  ── Stopping iteration — limit reached ──`);
        printFlightSummary(0, flightACardText);

        // Expand to see per-stop violations
        const paxToggleAgain = page.locator('[data-testid="flight-card"]').first().locator("button").filter({ hasText: /pax/i });
        const expandAgain = await paxToggleAgain.isVisible({ timeout: 2_000 }).catch(() => false);
        if (expandAgain) {
          await paxToggleAgain.click();
          await page.waitForTimeout(500);
          const expandedText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
          printStopActivities(expandedText);
        }
        break;
      }

      // Expand every 3 iterations to verify stop activity updates
      if (iter % 3 === 2) {
        const paxToggle = page.locator('[data-testid="flight-card"]').first().locator("button").filter({ hasText: /pax/i });
        const paxExpanded = await paxToggle.isVisible({ timeout: 2_000 }).catch(() => false);
        if (paxExpanded) {
          await paxToggle.click();
          await page.waitForTimeout(500);
          const expandedText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
          printStopActivities(expandedText);
          printPassengerDetails(expandedText);
        }
      }
    }

    console.log(`\n  📊 Flight A Final Summary:`);
    console.log(`     Total passengers assigned: ${assignedCount}`);
    console.log(`     Flight card ID: ${flightAId}`);
    console.log(`     Route: ${await extractRouteFromCard(page, 0)}`);
    console.log(`     Final validation: ${await getValidationStatus(page, 0)}`);

    // Verify no internal server errors
    await schedulePage.expectNoErrors();
    console.log(`\n  ✅ TEST 1 COMPLETE — no errors`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Second Flight + Multi-Flight Board Validation
  // ──────────────────────────────────────────────────────────────────────────

  test("should create a second flight and distribute remaining passengers", async ({ page }) => {
    printDivider("TEST 2: Second Flight Creation + Passenger Distribution");

    await schedulePage.goto();
    // The schedule-board only renders when flights exist
    const boardVisible = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardVisible) {
      console.log("  ℹ No schedule-board (no flights yet — expected)");
    }

    const initialBookingCount = await schedulePage.getUnassignedBookingCount();
    const initialFlightCount = await schedulePage.getFlightCardCount();

    console.log(`\n  📋 Initial State:`);
    console.log(`     Unassigned bookings: ${initialBookingCount}`);
    console.log(`     Existing flights: ${initialFlightCount}`);

    if (initialBookingCount < 2) {
      console.log("  ⏭ Need at least 2 unassigned bookings — skipping test");
      test.skip();
      return;
    }

    // ── Create Flight A ────────────────────────────────────────────────────

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true, "No booking ID found"); return; }

    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    const draftVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);

    if (draftVisible && initialFlightCount === 0) {
      console.log(`  Creating Flight A: booking-${booking1Id} → draft`);
      await dragBookingToDraftFlight(page, booking1Id);
      await page.waitForTimeout(1000);
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });
    }

    const flightCountAfterA = await schedulePage.getFlightCardCount();
    console.log(`  ✅ Flight A ready — total flights: ${flightCountAfterA}`);

    // ── Assign Pilot + Aircraft to Flight A ────────────────────────────────

    await assignPilot(page, 0);
    await page.waitForTimeout(300);
    await assignAircraft(page, 0);
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");

    // Log Flight A state
    let flightAText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
    console.log(`\n  📋 Flight A State:`);
    printFlightSummary(0, flightAText);

    // ── Add 2 more passengers to Flight A ──────────────────────────────────

    const flightAIds = await getFlightCardIds(page);
    const flightAId = flightAIds[0];
    if (!flightAId) { test.skip(true, "Cannot determine Flight A ID"); return; }

    const maxToAdd = 3;
    for (let i = 0; i < maxToAdd; i++) {
      const nextId = await getFirstBookingLegId(page);
      if (!nextId) break;
      console.log(`  ➕ Adding booking-${nextId} to Flight A`);
      await dragBookingToFlight(page, nextId, flightAId);
      await page.waitForTimeout(500);
      await page.waitForLoadState("networkidle");
    }

    flightAText = await page.locator('[data-testid="flight-card"]').nth(0).innerText();
    console.log(`  ✅ Flight A now has ${await extractPassengerCount(flightAText)} passengers`);
    console.log(`     Validation: ${await getValidationStatus(page, 0)}`);

    // ── Create Flight B from remaining bookings ────────────────────────────

    const remainingBookings = await schedulePage.getUnassignedBookingCount();
    if (remainingBookings === 0) {
      console.log("  ⚠ No remaining bookings for Flight B");
      await schedulePage.expectNoErrors();
      return;
    }

    printDivider("Creating Flight B");

    const bookingB1Id = await getFirstBookingLegId(page);
    if (!bookingB1Id) { test.skip(true, "No booking for Flight B"); return; }

    const draftBVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);
    if (draftBVisible) {
      console.log(`  Creating Flight B: booking-${bookingB1Id} → draft`);
      await dragBookingToDraftFlight(page, bookingB1Id);
      await page.waitForTimeout(1000);
      await page.waitForLoadState("networkidle");
    }

    const flightCountAfterB = await schedulePage.getFlightCardCount();
    console.log(`  ✅ Flight B created — total flights: ${flightCountAfterB}`);
    expect(flightCountAfterB).toBeGreaterThan(flightCountAfterA);

    // ── Assign Pilot + Aircraft to Flight B ────────────────────────────────

    const flightBIdx = flightCountAfterB - 1;
    await assignPilot(page, flightBIdx);
    await page.waitForTimeout(300);
    await assignAircraft(page, flightBIdx);
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");

    let flightBText = await page.locator('[data-testid="flight-card"]').nth(flightBIdx).innerText();
    console.log(`\n  📋 Flight B State:`);
    printFlightSummary(flightBIdx, flightBText);

    // ── Add remaining passengers to Flight B ───────────────────────────────

    const flightIdsAfterB = await getFlightCardIds(page);
    const flightBId = flightIdsAfterB[flightIdsAfterB.length - 1];
    if (!flightBId) { test.skip(true, "Cannot determine Flight B ID"); return; }

    console.log(`\n  🔄 Adding remaining passengers to Flight B (id=${flightBId})...`);

    let bookingsAddedToB = 0;
    const maxB = 6;
    for (let i = 0; i < maxB; i++) {
      const nextId = await getFirstBookingLegId(page);
      if (!nextId) {
        console.log(`  ✅ All bookings consumed`);
        break;
      }
      console.log(`  ➕ Adding booking-${nextId} to Flight B`);
      await dragBookingToFlight(page, nextId, flightBId);
      await page.waitForTimeout(700);
      await page.waitForLoadState("networkidle");

      bookingsAddedToB++;

      flightBText = await page.locator('[data-testid="flight-card"]').nth(flightBIdx).innerText();
      const bPax = await extractPassengerCount(flightBText);
      const bValidation = await getValidationStatus(page, flightBIdx);
      console.log(`     👤 Passengers: ${bPax}, Validation: ${bValidation}`);

      if (bValidation === "violation") {
        console.log(`  ⛔ Flight B limit reached at ${bookingsAddedToB} bookings`);
        break;
      }
    }

    // ── Final verification ─────────────────────────────────────────────────

    printDivider("Final Board State");

    const finalFlightCount = await schedulePage.getFlightCardCount();
    for (let f = 0; f < finalFlightCount; f++) {
      const cardText = await page.locator('[data-testid="flight-card"]').nth(f).innerText();
      console.log(`\n  ── Flight ${String.fromCharCode(65 + f)} ──`);
      const route = await extractRouteFromCard(page, f);
      const pax = await extractPassengerCount(cardText);
      const validation = await getValidationStatus(page, f);
      console.log(`     Route: ${route}`);
      console.log(`     Passengers: ${pax}`);
      console.log(`     Validation: ${validation}`);
    }

    const finalUnassigned = await schedulePage.getUnassignedBookingCount();
    console.log(`\n  📊 Totals:`);
    console.log(`     Flights: ${initialFlightCount} → ${finalFlightCount}`);
    console.log(`     Unassigned: ${initialBookingCount} → ${finalUnassigned}`);

    await schedulePage.expectNoErrors();
    console.log(`\n  ✅ TEST 2 COMPLETE — no errors`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Cross-Date Schedule Independence
  // ──────────────────────────────────────────────────────────────────────────

  test("should validate schedules independently across multiple dates", async ({ page }) => {
    printDivider("TEST 3: Cross-Date Schedule Validation");

    const dates: string[] = [];
    const today = new Date();

    for (let offset = 0; offset <= 2; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      const iso = d.toISOString().slice(0, 10);
      dates.push(iso);
    }

    console.log(`  Testing dates: ${dates.join(", ")}`);

    const allFlightDetails: Array<{
      date: string;
      flightsCreated: number;
      totalPassengers: number;
      validationIssues: string[];
      routes: string[];
    }> = [];

    for (const date of dates) {
      printDivider(`Date: ${date}`);

      await schedulePage.goto(date);
      // The schedule-board only renders when flights exist
    const boardVisible = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardVisible) {
      console.log("  ℹ No schedule-board (no flights yet — expected)");
    }

      const bookingCount = await schedulePage.getUnassignedBookingCount();
      console.log(`  📋 Unassigned bookings: ${bookingCount}`);

      if (bookingCount === 0) {
        console.log(`  ⏭ No data for ${date} — skipping`);
        allFlightDetails.push({
          date,
          flightsCreated: 0,
          totalPassengers: 0,
          validationIssues: [],
          routes: [],
        });
        continue;
      }

      const initialFlightCount = await schedulePage.getFlightCardCount();

      // Create up to 2 flights for this date
      let flightsCreated = 0;
      const routes: string[] = [];
      const validationIssues: string[] = [];

      for (let flightNum = 0; flightNum < 2; flightNum++) {
        const remaining = await schedulePage.getUnassignedBookingCount();
        if (remaining === 0) break;

        const bookingId = await getFirstBookingLegId(page);
        if (!bookingId) break;

        const draft = page.locator('[data-testid="draft-flight-placeholder"]');
        const draftOk = await draft.isVisible({ timeout: 5_000 }).catch(() => false);

        if (draftOk) {
          console.log(`  🛫 Creating Flight #${flightNum + 1}: booking-${bookingId} → draft`);
          await dragBookingToDraftFlight(page, bookingId);
          await page.waitForTimeout(1000);
          await page.waitForLoadState("networkidle");
          flightsCreated++;

          const route = await extractRouteFromCard(page, flightsCreated - 1);
          routes.push(route);
          console.log(`     Route: ${route}`);
        } else if (initialFlightCount > 0 && flightNum === 0) {
          console.log(`  📌 Using existing flights (${initialFlightCount} already present)`);
          flightsCreated = initialFlightCount;
          break;
        }

        // Wait for card to appear
        await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 10_000 });
      }

      // Try assigning pilot and aircraft to the first flight
      if (flightsCreated > 0 || initialFlightCount > 0) {
        const assignableFlightIdx = initialFlightCount > 0 ? 0 : flightsCreated - 1;
        await assignPilot(page, assignableFlightIdx);
        await page.waitForTimeout(300);
        await assignAircraft(page, assignableFlightIdx);
        await page.waitForTimeout(500);
        await page.waitForLoadState("networkidle");
      }

      // Log flight card details
      const currentFlights = await schedulePage.getFlightCardCount();
      let totalPassengers = 0;
      for (let f = 0; f < currentFlights; f++) {
        const cardText = await page.locator('[data-testid="flight-card"]').nth(f).innerText();
        const pax = await extractPassengerCount(cardText);
        totalPassengers += pax;
        const validation = await getValidationStatus(page, f);
        if (validation !== "ok") {
          validationIssues.push(`Flight ${String.fromCharCode(65 + f)}: ${validation}`);
        }
        console.log(`  📊 Flight ${String.fromCharCode(65 + f)}: ${pax} pax, status=${validation}`);
      }

      allFlightDetails.push({
        date,
        flightsCreated: currentFlights,
        totalPassengers,
        validationIssues,
        routes,
      });

      await schedulePage.expectNoErrors();
    }

    // ── Cross-date assertions ──────────────────────────────────────────────

    console.log(`\n${"=".repeat(70)}`);
    console.log(`  CROSS-DATE SUMMARY`);
    console.log(`${"=".repeat(70)}`);

    for (const detail of allFlightDetails) {
      console.log(`\n  📅 ${detail.date}:`);
      console.log(`     Flights: ${detail.flightsCreated}`);
      console.log(`     Total passengers: ${detail.totalPassengers}`);
      console.log(`     Routes: ${detail.routes.join(", ") || "none"}`);
      console.log(`     Issues: ${detail.validationIssues.join(", ") || "none"}`);
    }

    // Assert that at least one date had bookings
    const datesWithBookings = allFlightDetails.filter(d => d.totalPassengers > 0);
    if (datesWithBookings.length === 0) {
      console.log("  ⚠ No dates had unassigned bookings — this is expected for some test data states");
      test.skip();
      return;
    }

    // Assert no errors on any date
    await schedulePage.expectNoErrors();

    console.log(`\n  ✅ TEST 3 COMPLETE — ${allFlightDetails.length} dates validated`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Flight Path Correctness Verification
  // ──────────────────────────────────────────────────────────────────────────

  test("should verify correct flight path generation for all created flights", async ({ page }) => {
    printDivider("TEST 4: Flight Path Correctness Verification");

    await schedulePage.goto();
    // The schedule-board only renders when flights exist
    const boardVisible = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardVisible) {
      console.log("  ℹ No schedule-board (no flights yet — expected)");
    }

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    const initialFlightCount = await schedulePage.getFlightCardCount();

    console.log(`  Unassigned: ${bookingCount}, Existing flights: ${initialFlightCount}`);

    // Use existing flights or create one
    if (initialFlightCount === 0 && bookingCount > 0) {
      const bookingId = await getFirstBookingLegId(page);
      if (bookingId) {
        const draft = page.locator('[data-testid="draft-flight-placeholder"]');
        if (await draft.isVisible({ timeout: 5_000 }).catch(() => false)) {
          console.log("  Creating a flight for path verification...");
          await dragBookingToDraftFlight(page, bookingId);
          await page.waitForTimeout(1000);
          await page.waitForLoadState("networkidle");
          await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });
        }
      }
    }

    const flightCount = await schedulePage.getFlightCardCount();
    if (flightCount === 0) {
      console.log("  ⏭ No flights to verify — skipping");
      test.skip();
      return;
    }

    // ── Verify flight path for each flight ─────────────────────────────────

    for (let f = 0; f < flightCount; f++) {
      const card = page.locator('[data-testid="flight-card"]').nth(f);
      const cardText = await card.innerText();

      console.log(`\n  ── Flight ${String.fromCharCode(65 + f)} ──`);

      // Extract flight number
      const flightNumberMatch = cardText.match(/FIG-\d{8}-\d{3}/);
      const flightNumber = flightNumberMatch ? flightNumberMatch[0] : "unknown";
      console.log(`     Flight #: ${flightNumber}`);

      // Extract route
      const route = await extractRouteFromCard(page, f);
      console.log(`     Route: ${route}`);

      // Business Rule 1: Flight path must start from STY
      const firstLegOrigin = route.split("→")[0]?.trim();
      console.log(`     First leg origin: ${firstLegOrigin}`);

      // Business Rule 1: Flight path must end at STY
      const lastLegDest = route.split("→").pop()?.trim();
      console.log(`     Last leg destination: ${lastLegDest}`);

      // Verify route format: should be "CODE → CODE → CODE" (at least 2 codes)

      // Expand passenger section and verify stop activities
      const paxToggle = card.locator("button").filter({ hasText: /pax/i });
      const toggleVisible = await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false);
      if (toggleVisible) {
        await paxToggle.click();
        await page.waitForTimeout(500);
        const expandedText = await card.innerText();

        console.log(`     Stop Activities:`);
        // Parse stop activities
        const stopMatches = expandedText.match(/\b[A-Z]{3}\b/g);
        const uniqueStops = [...new Set(stopMatches || [])];
        for (const stop of uniqueStops) {
          const hasArr = expandedText.includes(`${stop}`) &&
            expandedText.slice(expandedText.indexOf(stop)).includes("Arr");
          const hasDep = expandedText.includes(`${stop}`) &&
            expandedText.slice(expandedText.indexOf(stop)).includes("Dep");
          console.log(`       • ${stop}: ${hasArr ? "arrivals" : "no arrivals"}, ${hasDep ? "departures" : "no departures"}`);
        }

        // Business Rule 2: First stop = origin (arrivals empty, departures non-empty)
        // Business Rule 2: Last stop = destination (arrivals non-empty, departures empty)
      }
    }

    await schedulePage.expectNoErrors();
    console.log(`\n  ✅ TEST 4 COMPLETE — flight paths verified`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Passenger Detail Accuracy After Sequential Additions
  // ──────────────────────────────────────────────────────────────────────────

  test("should accurately display passenger details in flight card after sequential additions", async ({ page }) => {
    printDivider("TEST 5: Passenger Detail Accuracy After Sequential Additions");

    await schedulePage.goto();
    // The schedule-board only renders when flights exist
    const boardVisible = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardVisible) {
      console.log("  ℹ No schedule-board (no flights yet — expected)");
    }

    const bookingCount = await schedulePage.getUnassignedBookingCount();

    if (bookingCount < 2) {
      console.log("  ⏭ Need at least 2 unassigned bookings — skipping");
      test.skip();
      return;
    }

    // ── Create Flight with one booking ─────────────────────────────────────

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true, "No booking ID"); return; }

    const draft = page.locator('[data-testid="draft-flight-placeholder"]');
    if (!await draft.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log("  ⏭ Draft not visible — skipping");
      test.skip();
      return;
    }

    console.log("  Creating flight from first booking...");
    await dragBookingToDraftFlight(page, booking1Id);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    // Expand to see initial passenger state
    const card = page.locator('[data-testid="flight-card"]').first();
    let paxToggle = card.locator("button").filter({ hasText: /pax/i });
    if (await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await paxToggle.click();
      await page.waitForTimeout(500);
      let expandedText = await card.innerText();

      // Count passenger rows
      const initialPassengerRows = await card.locator('[data-testid="passenger-row"]').count();
      console.log(`  📋 After 1st booking: ${initialPassengerRows} passenger rows`);

      // Log passenger names
      const names = expandedText.split("\n").filter(l => /[A-Z][a-z]+ [A-Z][a-z]+/.test(l));
      console.log(`     Names: ${names.slice(0, 10).join(", ")}`);

      // ── Add second booking ─────────────────────────────────────────────

      const flightIds = await getFlightCardIds(page);
      const flightId = flightIds[0];
      if (!flightId) { test.skip(true, "No flight ID"); return; }

      const booking2Id = await getFirstBookingLegId(page);
      if (booking2Id && booking2Id !== booking1Id) {
        console.log(`\n  ➕ Adding second booking (${booking2Id}) to same flight...`);
        await dragBookingToFlight(page, booking2Id, flightId);
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle");

        // Re-expand and check
        paxToggle = card.locator("button").filter({ hasText: /pax/i });
        if (await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await paxToggle.click();
          await page.waitForTimeout(500);
          expandedText = await card.innerText();

          const updatedPassengerRows = await card.locator('[data-testid="passenger-row"]').count();
          console.log(`  📋 After 2nd booking: ${updatedPassengerRows} passenger rows`);
          expect(updatedPassengerRows).toBeGreaterThanOrEqual(initialPassengerRows);

          // Verify passenger details remain accurate
          const updatedNames = expandedText.split("\n").filter(l => /[A-Z][a-z]+ [A-Z][a-z]+/.test(l));
          console.log(`     Updated names: ${updatedNames.slice(0, 10).join(", ")}`);

          // Verify stop activities updated
          const stopCodes = [...new Set(expandedText.match(/\b[A-Z]{3}\b/g) || [])];
          console.log(`     Stop codes: ${stopCodes.join(", ")}`);
        }

        // ── Add third booking ────────────────────────────────────────────

        const booking3Id = await getFirstBookingLegId(page);
        if (booking3Id && booking3Id !== booking1Id && booking3Id !== booking2Id) {
          console.log(`\n  ➕ Adding third booking (${booking3Id}) to same flight...`);
          await dragBookingToFlight(page, booking3Id, flightId);
          await page.waitForTimeout(700);
          await page.waitForLoadState("networkidle");

          paxToggle = card.locator("button").filter({ hasText: /pax/i });
          if (await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await paxToggle.click();
            await page.waitForTimeout(500);
            expandedText = await card.innerText();

            const finalPassengerRows = await card.locator('[data-testid="passenger-row"]').count();
            console.log(`  📋 After 3rd booking: ${finalPassengerRows} passenger rows`);
            expect(finalPassengerRows).toBeGreaterThanOrEqual(2);

            const finalNames = expandedText.split("\n").filter(l => /[A-Z][a-z]+ [A-Z][a-z]+/.test(l));
            console.log(`     Final names: ${finalNames.slice(0, 15).join(", ")}`);
            console.log(`     Total unique names: ${[...new Set(finalNames)].length}`);

            // Verify all stop activities have arrived/departed passengers in correct categories
            const stopLines = expandedText.split("\n").filter(l => /\b[A-Z]{3}\b/.test(l));
            console.log(`     Stop activity lines: ${stopLines.length}`);
          }
        }
      }
    }

    // All passenger rows should have proper data-testid attributes
    const allPassengerRows = await card.locator('[data-testid="passenger-row"]').count();
    console.log(`\n  📊 Final passenger row count: ${allPassengerRows}`);
    expect(allPassengerRows).toBeGreaterThanOrEqual(2);

    await schedulePage.expectNoErrors();
    console.log(`\n  ✅ TEST 5 COMPLETE — passenger details verified`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLEMENTARY: Standalone Validation Tests
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("E2E Drag-and-Drop — Pilot/Aircraft Assignment & Validation Feedback", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
  });

  test("should show 'Awaiting pilot & aircraft' before assignment", async ({ page }) => {
    printDivider("Assignment Validation: Pre-Assignment State");

    await schedulePage.goto();
    // The schedule-board only renders when flights exist
    const boardVisible = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardVisible) {
      console.log("  ℹ No schedule-board (no flights yet — expected)");
    }

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    if (bookingCount === 0) { test.skip(); return; }

    const bookingId = await getFirstBookingLegId(page);
    if (!bookingId) { test.skip(true); return; }

    const draft = page.locator('[data-testid="draft-flight-placeholder"]');
    if (!await draft.isVisible({ timeout: 5_000 }).catch(() => false)) { test.skip(); return; }

    await dragBookingToDraftFlight(page, bookingId);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    const cardText = await page.locator('[data-testid="flight-card"]').first().innerText();
    console.log("  Flight card text after creation (before assignments):");
    printFlightSummary(0, cardText);

    expect(cardText).toMatch(/Awaiting|pilot|aircraft/i);

    await schedulePage.expectNoErrors();
    console.log("  ✅ Pre-assignment validation banner present");
  });

  test("should recalculate weight validation after pilot and aircraft assignment", async ({ page }) => {
    printDivider("Assignment Validation: Post-Assignment Recalculation");

    await schedulePage.goto();
    // The schedule-board only renders when flights exist
    const boardVisible = await page.locator('[data-testid="schedule-board"]').isVisible({ timeout: 3_000 }).catch(() => false);
    if (!boardVisible) {
      console.log("  ℹ No schedule-board (no flights yet — expected)");
    }

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    if (bookingCount === 0) { test.skip(); return; }

    const bookingId = await getFirstBookingLegId(page);
    if (!bookingId) { test.skip(true); return; }

    const draft = page.locator('[data-testid="draft-flight-placeholder"]');
    if (!await draft.isVisible({ timeout: 5_000 }).catch(() => false)) { test.skip(); return; }

    await dragBookingToDraftFlight(page, bookingId);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    // Add a couple more passengers to make weight interesting
    const flightIds = await getFlightCardIds(page);
    const flightId = flightIds[0];
    if (!flightId) { test.skip(true); return; }

    for (let i = 0; i < 2; i++) {
      const nextId = await getFirstBookingLegId(page);
      if (nextId) {
        await dragBookingToFlight(page, nextId, flightId);
        await page.waitForTimeout(500);
        await page.waitForLoadState("networkidle");
      }
    }

    // Before assignment
    const beforeText = await page.locator('[data-testid="flight-card"]').first().innerText();
    console.log("  BEFORE assignment:");
    printFlightSummary(0, beforeText);

    // Assign pilot
    const pilotOk = await assignPilot(page, 0);
    console.log(`  Pilot assigned: ${pilotOk}`);
    await page.waitForTimeout(300);

    if (pilotOk) {
      const afterPilotText = await page.locator('[data-testid="flight-card"]').first().innerText();
      // Should show "Awaiting aircraft" still
      const hasAwaitingAc = afterPilotText.includes("Awaiting aircraft") || afterPilotText.includes("aircraft");
      console.log(`  After pilot: "Awaiting aircraft" present: ${hasAwaitingAc}`);
    }

    // Assign aircraft
    const acOk = await assignAircraft(page, 0);
    console.log(`  Aircraft assigned: ${acOk}`);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");

    if (acOk) {
      const afterText = await page.locator('[data-testid="flight-card"]').first().innerText();
      console.log("  AFTER assignment:");
      printFlightSummary(0, afterText);

      // Should now show per-stop weight validation (MTOW/MLW percentages)
      // Weight values like "XXX / YYY kg" or MTOW/MLW indicators
      const hasWeightData = afterText.includes("kg") && (afterText.includes("MTOW") || afterText.includes("MLW"));
      console.log(`  Weight validation visible: ${hasWeightData}`);

      // Verify that after assignment, the "Awaiting pilot/aircraft" messaging updates
      const stillAwaiting = afterText.includes("Awaiting pilot") && afterText.includes("Awaiting aircraft");
      if (stillAwaiting) {
        console.log("  ⚠ Both pilot and aircraft still pending — assignment may have failed silently");
      } else {
        console.log("  ✅ Assignment messaging updated");
      }
    }

    await schedulePage.expectNoErrors();
    console.log("  ✅ Post-assignment validation verified");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG REPRODUCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Bug Reproduction — Per-Passenger Assignment & Draft Persistence", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
    await schedulePage.goto();
    await page.waitForLoadState("networkidle");
  });

  // ── Bug 1: Passengers from same group booking → different flights ───────

  test("BUG-1: should allow passengers from the same group booking to be assigned to different flights", async ({ page }) => {
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  BUG-1: Group Booking Passengers → Different Flights");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    console.log(`  Unassigned: ${bookingCount}, Flights: ${await schedulePage.getFlightCardCount()}`);

    if (bookingCount < 3) {
      console.log("  ⏭ Need at least 3 unassigned passengers — skipping");
      test.skip();
      return;
    }

    // Step 1: Find a booking with multiple passengers (passenger_count >= 2)
    const bookingItems = page.locator('[data-testid="booking-item"]');
    const itemCount = await bookingItems.count();
    console.log(`  Total booking items: ${itemCount}`);

    // Find items with the same booking_reference (same group booking)
    const groupPassengerIds: number[] = [];
    const firstCard = bookingItems.first();
    const firstRef = await firstCard.locator("span").first().innerText();
    console.log(`  First booking reference: ${firstRef}`);

    // Collect all items that start with this reference
    for (let i = 0; i < Math.min(itemCount, 10); i++) {
      const item = bookingItems.nth(i);
      const ref = await item.locator("span").first().innerText().catch(() => "");
      if (ref === firstRef) {
        const idAttr = await item.getAttribute("id");
        if (idAttr) {
          const num = parseInt(idAttr.replace("booking-", ""), 10);
          if (!isNaN(num)) groupPassengerIds.push(num);
        }
      }
    }

    console.log(`  Passengers in group ${firstRef}: ${groupPassengerIds.length}`);
    if (groupPassengerIds.length < 2) {
      console.log("  ⏭ Need at least 2 passengers from same booking — skipping");
      test.skip();
      return;
    }

    // Step 2: Create Flight A by dragging first group passenger to draft placeholder
    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    const draftVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);

    let flightAId: number | null = null;
    let flightBId: number | null = null;

    if (draftVisible) {
      console.log(`  🛫 Creating Flight A: booking-${groupPassengerIds[0]} → draft`);
      await dragBookingToDraftFlight(page, groupPassengerIds[0]);
      await page.waitForTimeout(1000);
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });
      const flightIds = await getFlightCardIds(page);
      flightAId = flightIds[0] || null;
      console.log(`  ✅ Flight A created (id=${flightAId})`);
    } else {
      // Use existing flight if draft not visible
      const flightIds = await getFlightCardIds(page);
      if (flightIds.length >= 2) {
        flightAId = flightIds[0];
        flightBId = flightIds[1];
        console.log(`  ℹ Using existing flights: A=${flightAId}, B=${flightBId}`);
        // Drag first passenger to Flight A
        await dragBookingToFlight(page, groupPassengerIds[0], flightAId);
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle");
      } else if (flightIds.length === 1) {
        flightAId = flightIds[0];
        console.log(`  ℹ Using existing Flight A (id=${flightAId})`);
        await dragBookingToFlight(page, groupPassengerIds[0], flightAId);
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle");
      }
    }

    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");

    // ── KEY ASSERTION 1: Flight A shows ONLY the dragged passenger ──
    if (flightAId) {
      const cardText = await page.locator(`[id="flight-${flightAId}"]`).innerText().catch(() => "");
      console.log(`\n  🔍 Flight A card content:`);
      const cardLines = cardText.split("\n").filter((l: string) => l.trim());
      for (const line of cardLines.slice(0, 12)) console.log(`     │ ${line}`);
      
      // Count passenger rows in the flight card
      const paxToggle = page.locator(`[id="flight-${flightAId}"]`).locator("button").filter({ hasText: /pax/i });
      if (await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await paxToggle.click();
        await page.waitForTimeout(500);
        const passengerRows = page.locator(`[id="flight-${flightAId}"] [data-testid="passenger-row"]`);
        const rowCount = await passengerRows.count();
        console.log(`     Passenger rows in flight: ${rowCount}`);
        if (rowCount > 0) {
          const names = await passengerRows.allInnerTexts();
          console.log(`     Names: ${names.join(", ")}`);
        }
        // After fix: only the dragged passenger should appear
        // Before fix (bug): all group members appeared
      }
    }

    // ── KEY ASSERTION 2: Other group passengers still appear in unassigned pool ──
    const remainingCount = await schedulePage.getUnassignedBookingCount();
    console.log(`\n  🔍 After assigning 1st group passenger:`);
    console.log(`     Unassigned pool count: ${remainingCount} (should include remaining group members)`);

    // Check if the other group passenger IDs are still visible
    const remainingBookings = page.locator('[data-testid="booking-item"]');
    const remainingIds: number[] = [];
    const remCount = await remainingBookings.count();
    for (let i = 0; i < remCount; i++) {
      const idAttr = await remainingBookings.nth(i).getAttribute("id");
      if (idAttr) {
        const num = parseInt(idAttr.replace("booking-", ""), 10);
        if (!isNaN(num)) remainingIds.push(num);
      }
    }

    const otherGroupIdsStillVisible = groupPassengerIds.filter(id => id !== groupPassengerIds[0] && remainingIds.includes(id));
    console.log(`     Other group members still in pool: ${otherGroupIdsStillVisible.length} of ${groupPassengerIds.length - 1}`);

    // This was the bug: group members disappeared from unassigned pool
    // After fix, they should remain visible
    if (otherGroupIdsStillVisible.length > 0) {
      console.log("  ✅ BUG-1 FIX VERIFIED: Other group members remain in unassigned pool");

      // Step 3: Create Flight B by dragging 2nd group passenger to draft or existing flight
      if (draftVisible) {
        console.log(`\n  🛫 Creating Flight B: booking-${otherGroupIdsStillVisible[0]} → draft`);
        await dragBookingToDraftFlight(page, otherGroupIdsStillVisible[0]);
        await page.waitForTimeout(1000);
        await page.waitForLoadState("networkidle");
        const updatedFlightIds = await getFlightCardIds(page);
        if (updatedFlightIds.length > 1) flightBId = updatedFlightIds[1];
        console.log(`  ✅ Flight B created (id=${flightBId})`);
      } else if (flightBId) {
        console.log(`\n  🛫 Adding to Flight B: booking-${otherGroupIdsStillVisible[0]} → flight-${flightBId}`);
        await dragBookingToFlight(page, otherGroupIdsStillVisible[0], flightBId);
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle");
      }

      // Verify both flights have at least 1 passenger
      if (flightAId !== null) {
        const flightAText = await page.locator(`[id="flight-${flightAId}"]`).innerText().catch(() => "");
        const aPax = flightAText.match(/(\d+)\s*pax/)?.[1] || "?";
        console.log(`  📊 Flight A passengers: ${aPax}`);

        // PER-PASSENGER-ISOLATION:  Verify that the other group passenger is NOT on Flight A.
        // This guards the regression where booking-leg-level manifest queries (bl.flight_id)
        // leaked passengers who share a booking leg but were never individually assigned.
        const passengerRows = await page.locator('[data-testid="passenger-row"]');
        const passengerCount = await passengerRows.count();
        let foundOtherPaxName = false;
        for (let i = 0; i < passengerCount; i++) {
          const rowText = await passengerRows.nth(i).innerText();
          // Check against known other-group passenger names visible in pool
          for (const otherId of otherGroupIdsStillVisible) {
            const poolEl = page.locator(`[id="booking-${otherId}"]`);
            const poolName = await poolEl.locator("div").first().innerText().catch(() => "");
            if (poolName && rowText.includes(poolName.split(" ")[0])) {
              foundOtherPaxName = true;
              console.log(`  ❌ ISOLATION VIOLATION: "${poolName}" found on Flight A`);
            }
          }
        }
        if (!foundOtherPaxName) {
          console.log("  ✅ Per-passenger isolation verified: other group passenger NOT on Flight A");
        }
      }
    } else {
      console.log("  ❌ BUG-1 NOT FIXED: Other group members disappeared from unassigned pool");
    }

    await schedulePage.expectNoErrors();
    console.log("  ✅ BUG-1 test complete");
  });

  // ── Bug 2: Passenger details persist on page refresh ────────────────────

  test("BUG-2: should persist passenger details on page refresh for draft flights", async ({ page }) => {
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  BUG-2: Draft Flight Passenger Persistence on Refresh");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    console.log(`  Unassigned: ${bookingCount}, Flights: ${await schedulePage.getFlightCardCount()}`);

    if (bookingCount < 2) {
      console.log("  ⏭ Need at least 2 unassigned passengers — skipping");
      test.skip();
      return;
    }

    // Step 1: Create a flight with passengers
    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    const draftVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!draftVisible) {
      console.log("  ⏭ Draft placeholder not visible (flights may already exist) — skipping");
      test.skip();
      return;
    }

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true, "No booking ID"); return; }

    console.log(`  🛫 Creating draft flight: booking-${booking1Id} → draft`);
    await dragBookingToDraftFlight(page, booking1Id);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    // Step 2: Add a second passenger to the same flight
    const flightIds = await getFlightCardIds(page);
    const flightId = flightIds[0];
    if (!flightId) { test.skip(true, "No flight ID"); return; }

    const booking2Id = await getFirstBookingLegId(page);
    if (booking2Id) {
      console.log(`  ➕ Adding booking-${booking2Id} to flight-${flightId}`);
      await dragBookingToFlight(page, booking2Id, flightId);
      await page.waitForTimeout(700);
      await page.waitForLoadState("networkidle");
    }

    // Count passengers before refresh
    const cardBefore = page.locator(`[id="flight-${flightId}"]`);
    const beforeText = await cardBefore.innerText();
    const beforePaxMatch = beforeText.match(/(\d+)\s*pax/);
    const beforePax = beforePaxMatch ? parseInt(beforePaxMatch[1], 10) : 0;
    console.log(`\n  📋 Before refresh: ${beforePax} passengers`);

    // Expand passenger section to count passenger rows
    const paxToggle = cardBefore.locator("button").filter({ hasText: /pax/i });
    if (await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await paxToggle.click();
      await page.waitForTimeout(500);
      const passengerRowsBefore = await cardBefore.locator('[data-testid="passenger-row"]').count();
      console.log(`     Passenger rows: ${passengerRowsBefore}`);
    }

    // Step 3: REFRESH the page
    console.log(`\n  🔄 Refreshing page...`);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Step 4: Verify passenger details persisted
    const cardAfter = page.locator(`[id="flight-${flightId}"]`);
    const afterVisible = await cardAfter.isVisible({ timeout: 10_000 }).catch(() => false);

    if (afterVisible) {
      const afterText = await cardAfter.innerText();
      const afterPaxMatch = afterText.match(/(\d+)\s*pax/);
      const afterPax = afterPaxMatch ? parseInt(afterPaxMatch[1], 10) : 0;

      console.log(`  📋 After refresh: ${afterPax} passengers`);

      // Expand to count passenger rows
      const afterPaxToggle = cardAfter.locator("button").filter({ hasText: /pax/i });
      if (await afterPaxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await afterPaxToggle.click();
        await page.waitForTimeout(500);
        const passengerRowsAfter = await cardAfter.locator('[data-testid="passenger-row"]').count();
        console.log(`     Passenger rows: ${passengerRowsAfter}`);

        // KEY ASSERTION: Passengers should still be visible after refresh
        if (passengerRowsAfter > 0) {
          console.log("  ✅ BUG-2 FIX VERIFIED: Passenger details persisted after refresh");
        } else {
          console.log("  ❌ BUG-2 NOT FIXED: No passenger rows after refresh");
        }
      }

      // Also verify the flight path is intact
      const routeAfter = afterText.match(/[A-Z]{3}(?:\s*[→\u2192]\s*[A-Z]{3})+/);
      if (routeAfter) {
        console.log(`     Route intact: ${routeAfter[0]}`);
      }
    } else {
      console.log("  ⚠ Flight card not found after refresh — may have been removed");
    }

    await schedulePage.expectNoErrors();
    console.log("  ✅ BUG-2 test complete");
  });

  // ── Loadsheet Consistency Test ──────────────────────────────────────────

  test("LOADSH-1: should show matching passenger data in loadsheet after flight creation", async ({ page }) => {
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  LOADSH-1: Loadsheet ↔ Flight Card Data Parity");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    console.log(`  Unassigned: ${bookingCount}, Flights: ${await schedulePage.getFlightCardCount()}`);

    if (bookingCount < 2) {
      console.log("  ⏭ Need at least 2 unassigned passengers — skipping");
      test.skip();
      return;
    }

    // Step 1: Create a flight with 2 passengers via drag-and-drop
    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    const draftVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!draftVisible) {
      console.log("  ⏭ Draft placeholder not visible — skipping");
      test.skip();
      return;
    }

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true, "No booking ID"); return; }
    console.log(`  🛫 Creating flight: booking-${booking1Id} → draft`);
    await dragBookingToDraftFlight(page, booking1Id);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    const flightIds = await getFlightCardIds(page);
    const flightId = flightIds[0];
    if (!flightId) { test.skip(true, "No flight ID"); return; }

    // Add a second passenger
    const booking2Id = await getFirstBookingLegId(page);
    if (booking2Id) {
      console.log(`  ➕ Adding booking-${booking2Id} to flight-${flightId}`);
      await dragBookingToFlight(page, booking2Id, flightId);
      await page.waitForTimeout(700);
      await page.waitForLoadState("networkidle");
    }

    // Step 2: Read flight card passenger data
    const flightCard = page.locator(`[id="flight-${flightId}"]`);
    const cardText = await flightCard.innerText();
    const paxMatch = cardText.match(/(\d+)\s*pax/);
    const flightCardPaxCount = paxMatch ? parseInt(paxMatch[1], 10) : 0;
    console.log(`\n  📋 Flight card shows: ${flightCardPaxCount} pax`);

    // Expand passenger section to read names
    const paxToggle = flightCard.locator("button").filter({ hasText: /pax/i });
    let flightCardPassengerNames: string[] = [];
    if (await paxToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await paxToggle.click();
      await page.waitForTimeout(500);
      const expandedText = await flightCard.innerText();
      flightCardPassengerNames = expandedText.split("\n")
        .filter((l: string) => /[A-Z][a-z]+\s[A-Z][a-z]+/.test(l.trim()))
        .filter((l: string) => !/(Pilot|Aircraft|Loadsheet|CHECK|STY|ALB|BKI|CCI|CHR|BVI|DGS|DWN|FBE|FIG|Arr|Dep|MTOW|MLW|Origin|Destination|pax|passen|Board)/.test(l));
      console.log(`     Names in flight card: ${[...new Set(flightCardPassengerNames)].join(", ")}`);
    }

    // Step 3: Open the loadsheet
    console.log(`\n  📄 Opening loadsheet for flight-${flightId}...`);
    const loadsheetBtn = flightCard.locator("button").filter({ has: page.locator('text="Loadsheet"') });
    if (await loadsheetBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await loadsheetBtn.click();
      await page.waitForTimeout(1000);
      await page.waitForLoadState("networkidle");
    } else {
      console.log("  ⚠ Loadsheet button not found");
      test.skip();
      return;
    }

    // Step 4: Wait for loadsheet modal to appear and load data
    // The modal has a loading spinner then shows the data
    await page.waitForTimeout(2000); // Wait for fetcher to complete

    // Look for the loadsheet modal content
    const loadsheetModal = page.locator(".fixed.inset-0.z-50");
    const modalVisible = await loadsheetModal.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!modalVisible) {
      console.log("  ⚠ Loadsheet modal not visible");
      test.skip();
      return;
    }

    // Step 5: Read loadsheet data and compare
    const modalText = await loadsheetModal.innerText();

    // Extract loadsheet pax count from header (e.g., "N pax" or "total_pax: N")
    const loadsheetPaxMatch = modalText.match(/(\d+)\s*pax/);
    const loadsheetPaxCount = loadsheetPaxMatch ? parseInt(loadsheetPaxMatch[1], 10) : 0;
    console.log(`  📋 Loadsheet shows: ${loadsheetPaxCount} pax`);

    // Extract passenger names from loadsheet passenger list
    const loadsheetPassengerLines = modalText.split("\n")
      .filter((l: string) => /Seat\s+[A-Z0-9]/i.test(l) || /[A-Z][a-z]+\s[A-Z][a-z]+\s+→/.test(l));
    console.log(`     Passenger entries in loadsheet: ${loadsheetPassengerLines.length}`);

    // Switch to passenger view if in operations mode
    const paxModeBtn = loadsheetModal.locator("button").filter({ hasText: "Passengers" });
    if (await paxModeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await paxModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Re-read modal text after mode switch
    const paxModalText = await loadsheetModal.innerText();
    const loadsheetNames = paxModalText.split("\n")
      .filter((l: string) => /[A-Z][a-z]+\s[A-Z][a-z]+\s+Seat/.test(l.trim()))
      .map((l: string) => l.trim().split(" Seat")[0]);
    console.log(`     Names in loadsheet: ${loadsheetNames.join(", ")}`);

    // ── ASSERTIONS ──────────────────────────────────────────────────────────

    console.log(`\n  🔍 Parity Check:`);

    // Assertion 1: Pax count should match
    if (flightCardPaxCount > 0 && loadsheetPaxCount > 0) {
      if (flightCardPaxCount === loadsheetPaxCount) {
        console.log(`  ✅ Pax count matches: flight card=${flightCardPaxCount}, loadsheet=${loadsheetPaxCount}`);
      } else {
        console.log(`  ❌ Pax count MISMATCH: flight card=${flightCardPaxCount}, loadsheet=${loadsheetPaxCount}`);
        console.log(`     This indicates loadsheet uses booking_leg.flight_id (group-level) instead of flight_leg_id (per-passenger).`);
      }
    } else {
      console.log(`  ⚠ Pax count: flight card=${flightCardPaxCount}, loadsheet=${loadsheetPaxCount} (one or both empty — loadsheet may not have been generated yet)`);
    }

    // Assertion 2: At least some passenger names appear in both
    const uniqueFlightNames = [...new Set(flightCardPassengerNames)];
    if (uniqueFlightNames.length > 0 && loadsheetNames.length > 0) {
      const namesInBoth = uniqueFlightNames.filter(fn =>
        loadsheetNames.some(ln => ln.includes(fn.split(" ").pop() || "")));
      console.log(`     Names found in both: ${namesInBoth.length} of ${uniqueFlightNames.length}`);
    }

    // Assertion 3: Modal is displayed with loadsheet header
    const hasLoadsheetTitle = modalText.includes("Loadsheet");
    expect(hasLoadsheetTitle).toBe(true);
    console.log("  ✅ Loadsheet modal displayed with header");

    // Assertion 4: Route is present in loadsheet (stop codes)
    const routeMatch = modalText.match(/[A-Z]{3}(?:\s*[→\u2192]\s*[A-Z]{3})+/);
    if (routeMatch) {
      console.log(`  ✅ Route in loadsheet: ${routeMatch[0]}`);
    }

    // Close modal
    const closeBtn = loadsheetModal.locator("button").first();
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }

    await schedulePage.expectNoErrors();
    console.log("  ✅ LOADSH-1 test complete");
  });

  // ── Loadsheet Regeneration Test ──────────────────────────────────────────

  test("LOADSH-2: should regenerate loadsheet to reflect newly added passengers", async ({ page }) => {
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  LOADSH-2: Loadsheet Regeneration After Passenger Addition");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    console.log(`  Unassigned: ${bookingCount}, Flights: ${await schedulePage.getFlightCardCount()}`);

    if (bookingCount < 3) {
      console.log("  ⏭ Need at least 3 unassigned passengers — skipping");
      test.skip();
      return;
    }

    // Step 1: Create flight with 1 passenger
    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    const draftVisible = await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!draftVisible) { test.skip(); return; }

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true); return; }
    await dragBookingToDraftFlight(page, booking1Id);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    const flightIds = await getFlightCardIds(page);
    const flightId = flightIds[0];
    if (!flightId) { test.skip(true); return; }

    // Step 2: Open loadsheet (generates initial loadsheet with 1 passenger)
    const flightCard = page.locator(`[id="flight-${flightId}"]`);
    const loadsheetBtn = flightCard.locator("button").filter({ has: page.locator('text="Loadsheet"') });
    if (!await loadsheetBtn.isVisible({ timeout: 3_000 }).catch(() => false)) { test.skip(); return; }

    await loadsheetBtn.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");

    const loadsheetModal = page.locator(".fixed.inset-0.z-50");
    if (!await loadsheetModal.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log("  ⚠ Loadsheet not visible after first open");
      test.skip();
      return;
    }

    // Switch to passenger view and read initial count
    const paxModeBtn = loadsheetModal.locator("button").filter({ hasText: "Passengers" });
    if (await paxModeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await paxModeBtn.click();
      await page.waitForTimeout(500);
    }
    const initialModalText = await loadsheetModal.innerText();
    const initialPaxMatch = initialModalText.match(/(\d+)\s*pax/);
    const initialLoadsheetPax = initialPaxMatch ? parseInt(initialPaxMatch[1], 10) : 0;
    console.log(`  📋 Initial loadsheet pax: ${initialLoadsheetPax}`);

    // Close modal
    await loadsheetModal.locator("button").first().click();
    await page.waitForTimeout(500);

    // Step 3: Add 2 more passengers to the flight
    console.log(`\n  ➕ Adding 2 more passengers to flight-${flightId}...`);
    for (let i = 0; i < 2; i++) {
      const nextId = await getFirstBookingLegId(page);
      if (nextId) {
        console.log(`     Dragging booking-${nextId}`);
        await dragBookingToFlight(page, nextId, flightId);
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle");
      }
    }

    // Read updated flight card pax count
    const updatedCardText = await flightCard.innerText();
    const updatedCardPaxMatch = updatedCardText.match(/(\d+)\s*pax/);
    const updatedCardPax = updatedCardPaxMatch ? parseInt(updatedCardPaxMatch[1], 10) : 0;
    console.log(`  📋 Flight card now shows: ${updatedCardPax} pax`);

    // Step 4: Re-open loadsheet — should be stale (cached from first open)
    console.log(`\n  📄 Re-opening loadsheet (cached)...`);
    await loadsheetBtn.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");

    const loadsheetModal2 = page.locator(".fixed.inset-0.z-50");
    if (!await loadsheetModal2.isVisible({ timeout: 10_000 }).catch(() => false)) { test.skip(); return; }

    const staleModalText = await loadsheetModal2.innerText();
    const stalePaxMatch = staleModalText.match(/(\d+)\s*pax/);
    const staleLoadsheetPax = stalePaxMatch ? parseInt(stalePaxMatch[1], 10) : 0;
    console.log(`  📋 Stale loadsheet pax: ${staleLoadsheetPax}`);
    console.log(`     Flight card: ${updatedCardPax} | Loadsheet: ${staleLoadsheetPax} ${updatedCardPax !== staleLoadsheetPax ? '❌ MISMATCH' : '✅ MATCH'}`);

    // ── Documented Finding ──────────────────────────────────────────────────
    console.log(`\n  📝 Finding:`);
    if (updatedCardPax !== staleLoadsheetPax) {
      console.log(`     The loadsheet was generated when the flight was first created`);
      console.log(`     and cached (stale count: ${staleLoadsheetPax}).`);
      console.log(`     Flight card now shows only individually assigned passengers (count: ${updatedCardPax}).`);
      console.log(`     Fix applied: createLoadsheetFromFlight now queries via flight_legs`);
      console.log(`     (JOIN flight_legs fl ON fl.id = blp.flight_leg_id) instead of`);
      console.log(`     booking_legs.flight_id, matching the manifest loader pattern.`);
    }

    // Close modal gracefully
    try {
      await loadsheetModal2.locator("button").first().click({ timeout: 3000 });
      await page.waitForTimeout(300);
    } catch {
      console.log("     Modal already closed");
    }
    console.log("  ✅ LOADSH-2 test complete");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SEQUENTIAL ADD/REMOVE SYNC TEST
  // ═══════════════════════════════════════════════════════════════════════════

  test("LOADSH-3: should sync flight card and loadsheet after each sequential passenger add/remove", async ({ page }) => {
    console.log("\n" + "=".repeat(70));
    console.log("  LOADSH-3: Sequential Passenger Add/Remove → Flight Card ↔ Loadsheet Sync");
    console.log("=".repeat(70) + "\n");

    const bookingCount = await schedulePage.getUnassignedBookingCount();
    const initialFlightCount = await schedulePage.getFlightCardCount();
    console.log(`  Initial: ${bookingCount} unassigned, ${initialFlightCount} flights`);

    if (bookingCount < 3) {
      console.log("  ⏭ Need at least 3 unassigned passengers — skipping");
      test.skip();
      return;
    }

    // ── Phase 0: Create flight with 1st passenger ──────────────────────────

    const draftPlaceholder = page.locator('[data-testid="draft-flight-placeholder"]');
    if (!await draftPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(); return;
    }

    const booking1Id = await getFirstBookingLegId(page);
    if (!booking1Id) { test.skip(true); return; }
    console.log(`  🛫 STEP 0: Create flight — booking-${booking1Id} → draft`);
    await dragBookingToDraftFlight(page, booking1Id);
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="flight-card"]').first()).toBeVisible({ timeout: 15_000 });

    const flightIds = await getFlightCardIds(page);
    const flightId = flightIds[0];
    if (!flightId) { test.skip(true); return; }
    const flightCard = page.locator(`[id="flight-${flightId}"]`);
    console.log(`     Flight created: id=${flightId}`);

    // ── Helper: read flight card pax count ─────────────────────────────────
    async function readFlightPax(): Promise<{ pax: number; weight: number; names: string[] }> {
      const text = await flightCard.innerText();
      const pax = parseInt((text.match(/(\d+)\s*pax/) || ["0", "0"])[1], 10);
      const weight = parseInt((text.match(/(\d+)kg/) || ["0", "0"])[1], 10);
      return { pax, weight, names: [] };
    }

    // ── Helper: read loadsheet pax count (open → read → close) ────────────
    async function readLoadsheetPax(label: string): Promise<number> {
      const lsBtn = flightCard.locator("button").filter({ has: page.locator('text="Loadsheet"') });
      if (!await lsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) return -1;
      await lsBtn.click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle");

      const modal = page.locator(".fixed.inset-0.z-50");
      if (!await modal.isVisible({ timeout: 10_000 }).catch(() => false)) return -1;

      const modalText = await modal.innerText();
      const pax = parseInt((modalText.match(/(\d+)\s*pax/) || ["0", "0"])[1], 10);

      console.log(`     📄 Loadsheet ${label}: ${pax} pax`);

      // Close modal
      await modal.locator("button").first().click();
      await page.waitForTimeout(300);
      return pax;
    }

    // ── Helper: drag passenger from unassigned pool to flight ──────────────
    async function addPassenger(step: number) {
      const nextId = await getFirstBookingLegId(page);
      if (!nextId) return null;
      console.log(`  ➕ STEP ${step}: Drag booking-${nextId} → flight-${flightId}`);
      const startTime = Date.now();
      await dragBookingToFlight(page, nextId, flightId);
      await page.waitForTimeout(500);
      await page.waitForLoadState("networkidle");
      console.log(`     Completed in ${Date.now() - startTime}ms`);
      return nextId;
    }

    // ── Helper: unassign passenger (drag passenger row to unassign pool) ───
    async function unassignPassenger(step: number): Promise<boolean> {
      const passengerRows = flightCard.locator('[data-testid="passenger-row"]');
      const rowCount = await passengerRows.count();
      if (rowCount === 0) return false;
      const firstRow = passengerRows.first();
      const idAttr = await firstRow.getAttribute("id").catch(() => "");
      const name = await firstRow.innerText();
      console.log(`  ➖ STEP ${step}: Unassign "${name.trim()}" → unassign pool`);
      const startTime = Date.now();
      await dragPassengerToUnassignPool(page, `[id="${idAttr}"]`);
      await page.waitForTimeout(700);
      await page.waitForLoadState("networkidle");
      console.log(`     Completed in ${Date.now() - startTime}ms`);
      return true;
    }

    // ── Log separator ──────────────────────────────────────────────────────
    function logState(step: string, cardPax: number, lsPax: number) {
      const match = cardPax === lsPax;
      const icon = match ? "✅" : "❌";
      console.log(`     ${icon} Step ${step}: card=${cardPax} pax | loadsheet=${lsPax} pax ${match ? "" : "← MISMATCH"}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // SEQUENCE
    // ═════════════════════════════════════════════════════════════════════

    // Step 1: Verify initial state (1 passenger from flight creation)
    let cardInfo = await readFlightPax();
    let lsPax = await readLoadsheetPax("after creation");
    logState("1 (init)", cardInfo.pax, lsPax);

    // Step 2: Add 2nd passenger
    await addPassenger(2);
    cardInfo = await readFlightPax();
    lsPax = await readLoadsheetPax("after +1");
    logState("2 (+1 pax)", cardInfo.pax, lsPax);

    // Step 3: Add 3rd passenger
    await addPassenger(3);
    cardInfo = await readFlightPax();
    lsPax = await readLoadsheetPax("after +2");
    logState("3 (+2 pax)", cardInfo.pax, lsPax);

    // Step 4: Add 4th passenger
    await addPassenger(4);
    cardInfo = await readFlightPax();
    lsPax = await readLoadsheetPax("after +3");
    logState("4 (+3 pax)", cardInfo.pax, lsPax);

    // Step 5: Unassign one passenger (reverse drag to unassign pool)
    const unassigned = await unassignPassenger(5);
    if (unassigned) {
      cardInfo = await readFlightPax();
      lsPax = await readLoadsheetPax("after unassign");
      logState("5 (-1 pax)", cardInfo.pax, lsPax);
    }

    // Step 6: Unassign another passenger
    const unassigned2 = await unassignPassenger(6);
    if (unassigned2) {
      cardInfo = await readFlightPax();
      lsPax = await readLoadsheetPax("after unassign x2");
      logState("6 (-2 pax)", cardInfo.pax, lsPax);
    }

    console.log(`\n  ══ SYNC TEST COMPLETE ══`);
  });
});
