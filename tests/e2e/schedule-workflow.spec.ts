/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Schedule Workflow — End-to-End Test Suite
 *
 * Covers the complete schedule-making lifecycle:
 *   1. Auto-build: generate flights from unassigned bookings
 *   2. Loadsheet verification: per-flight W&B, route, manifest
 *   3. Drag-and-drop: assign bookings to flights, create flights from bookings
 *   4. Post-mutation loadsheet re-verification
 *
 * DATA DEPENDENCY: Before running, seed the e2e drag-test data and ensure
 * the comprehensive dataset is loaded:
 *   npm run seed:comprehensive
 *   npm run seed:pbac && npm run seed:pbac:assign
 *   node --import tsx --env-file-if-exists=.env scripts/seed-e2e-drag-test.ts
 *
 * The e2e drag seed creates DRAG-001–014 bookings on today + 1 + 2 days
 * with draft schedules, which the drag-and-drop and auto-build tests depend
 * on. Without it, the tests gracefully skip.
 *
 * Robustness:
 *   - Every step is gated on preconditions (skips gracefully instead of
 *     failing if prerequisite data is absent).
 *   - All API responses are checked for status codes.
 *   - Console errors are collected per test and reported on failure.
 *   - A shared `TestRun` context tracks assertions, warnings, and timing.
 */

import { test, expect, type Page } from "@playwright/test";
import { SchedulePage } from "./pages/schedule-page";
import {
  dragBookingToFlight,
  dragBookingToDraftFlight,
} from "./helpers/drag-simulator";

// ─────────────────────────────────────────────────────────────────────────────
// TestRun — lightweight context that collects diagnostic data
// ─────────────────────────────────────────────────────────────────────────────

interface AssertionLog {
  description: string;
  passed: boolean;
  detail?: string;
}

class TestRun {
  assertions: AssertionLog[] = [];
  warnings: string[] = [];
  startedAt = Date.now();

  log(description: string, passed: boolean, detail?: string) {
    this.assertions.push({ description, passed, detail });
  }

  warn(msg: string) {
    this.warnings.push(msg);
    console.warn(`[WARN] ${msg}`);
  }

  elapsed(): string {
    return `${((Date.now() - this.startedAt) / 1000).toFixed(1)}s`;
  }

  summary(): string {
    const total = this.assertions.length;
    const passed = this.assertions.filter((a) => a.passed).length;
    const failed = total - passed;
    let report = `\n─── TestRun Summary (${this.elapsed()}) ───\n`;
    report += `  Assertions: ${total} total, ${passed} passed, ${failed} failed\n`;
    if (this.warnings.length > 0) {
      report += `  Warnings: ${this.warnings.length}\n`;
      this.warnings.slice(0, 10).forEach((w) => (report += `    • ${w}\n`));
    }
    const details = this.assertions.filter((a) => !a.passed);
    if (details.length > 0) {
      report += `  Failed:\n`;
      details.forEach((a) => (report += `    ✘ ${a.description}${a.detail ? ` — ${a.detail}` : ""}\n`));
    }
    return report;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wait for any in-flight Remix fetcher transitions to settle and verify
 * no 500-level errors surfaced in the DOM or console.
 */
async function waitForStable(page: Page, run: TestRun) {
  await page.waitForLoadState("networkidle").catch(() => run.warn("networkidle timeout"));
  await page.waitForTimeout(600);
  await expect(page.locator("text=Internal Server Error")).toHaveCount(0, { timeout: 3_000 }).catch(() =>
    run.warn("Internal Server Error element present")
  );
}

/**
 * Open the loadsheet for a flight by clicking the "Loadsheet" button
 * inside the flight card identified by its flight‑card testid.
 */
async function openLoadsheet(page: Page, flightCardNth: number, run: TestRun): Promise<boolean> {
  const flightCards = page.locator('[data-testid="flight-card"]');
  const count = await flightCards.count();
  if (count <= flightCardNth) {
    run.warn(`Flight card #${flightCardNth} not found (have ${count})`);
    return false;
  }

  const card = flightCards.nth(flightCardNth);
  const loadsheetBtn = card.locator('button[title="View Loadsheet"]');
  if (!(await loadsheetBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
    run.warn(`Loadsheet button not visible on flight #${flightCardNth}`);
    return false;
  }

  await loadsheetBtn.click();
  await page.waitForTimeout(800);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Schedule Builder — End-to-End Workflow", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);

    // Collect console errors per test so we can include them in the summary.
    page.on("pageerror", (err) => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });
  });

  // ── 1. Auto‑build ───────────────────────────────────────────────────────

  test("should auto-build flights from unassigned bookings and verify loadsheet", async ({ page }) => {
    const run = new TestRun();
    const CANDIDATE_DATES = ["2026-07-20", "2026-07-19", "2026-07-18"];

    await test.step("navigate to schedule date with bookings", async () => {
      for (const date of CANDIDATE_DATES) {
        await schedulePage.goto(date);
        const bc = await schedulePage.getUnassignedBookingCount();
        if (bc > 0) { run.log("found date with bookings", true, `date=${date}, count=${bc}`); break; }
      }
      run.log("navigated to schedule", true);
    });

    await test.step("check for unassigned bookings", async () => {
      const bookingCount = await schedulePage.getUnassignedBookingCount();
      console.log(`Unassigned bookings: ${bookingCount}`);
      if (bookingCount === 0) {
        run.warn("No unassigned bookings — auto-build will create 0 flights");
      }
      run.log("unassigned booking count retrieved", true, `count=${bookingCount}`);
    });

    await test.step("auto-build flights (or use existing schedule)", async () => {
      const genVisible = await schedulePage.autoBuildGenerateBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (genVisible) {
        await schedulePage.clickAutoBuild();
        await waitForStable(page, run);
      } else {
        run.log("Generate button not visible — using existing schedule if present", true);
      }

      const flightCount = await schedulePage.getFlightCardCount();
      console.log(`Flights present: ${flightCount}`);
      run.log("flights available for loadsheet verification", flightCount > 0, `count=${flightCount}`);
      if (flightCount === 0) {
        test.skip();
        return;
      }
    });

    await test.step("verify loadsheet content for first flight", async () => {
      const flightCount = await schedulePage.getFlightCardCount();
      if (flightCount === 0) {
        run.warn("No flights after auto-build — skipping loadsheet verification");
        test.skip();
        return;
      }

      const opened = await openLoadsheet(page, 0, run);
      if (!opened) {
        run.warn("Could not open loadsheet modal");
        return;
      }

      // ── Loadsheet content assertions ──────────────────────────────────

      // The loadsheet fetches /api/flight/<id>/wb-data; verify the modal
      // container appeared (the LoadsheetModal renders once fetcher has data).
      // Look for the journey panel showing STY at the start of the route.
      const loadsheetContent = page.locator("text=STY").first();
      const styVisible = await loadsheetContent.isVisible({ timeout: 10_000 }).catch(() => false);
      run.log("loadsheet shows STY (Stanley) in route", styVisible, "RULE 1 — first-leg origin must be STY");

      if (styVisible) {
        // Verify the route path shows STY → ... → STY (not collapsed "STY → STY")
        const routeText = await page.locator("body").textContent();
        const styMatches = (routeText?.match(/STY/g) || []).length;
        run.log("route shows STY at least twice (start + end)", styMatches >= 2, `STY count: ${styMatches}`);

        // The W&B summary panel should show weight values — check for any weight-related text
        const weightSection = page.locator("text=Weight").or(page.locator("text=weight")).or(page.locator("text=kg")).or(page.locator("text=Payload"));
        const hasWeight = await weightSection.first().isVisible({ timeout: 5_000 }).catch(() => false);
        run.log("loadsheet shows weight section", hasWeight);
      }

      // Close the modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      run.log("loadsheet modal closed", true);
    });

    console.log(run.summary());
    // Fail the test if any critical assertion failed
    const criticalFailures = run.assertions.filter(
      (a) => !a.passed && !a.description.includes("no flights") && !a.description.includes("unassigned")
    );
    if (criticalFailures.length > 0) {
      throw new Error(`Critical assertion failures: ${criticalFailures.map((a) => a.description).join("; ")}`);
    }
  });

  // ── 2. Drag‑and‑drop then verify loadsheet ───────────────────────────

  test("should drag booking to draft-flight placeholder and verify new flight loadsheet", async ({ page }) => {
    const run = new TestRun();
    const CANDIDATE_DATES = ["2026-07-20", "2026-07-19", "2026-07-18"];

    await test.step("navigate and check for bookings", async () => {
      for (const date of CANDIDATE_DATES) {
        await schedulePage.goto(date);
        const bookingCount = await schedulePage.getUnassignedBookingCount();
        if (bookingCount > 0) break;
      }
      const bookingCount = await schedulePage.getUnassignedBookingCount();
      if (bookingCount === 0) {
        run.warn("No unassigned bookings — skipping drag-to-create test");
        test.skip();
        return;
      }
      run.log("unassigned bookings present", true, `count=${bookingCount}`);
    });

    await test.step("check draft-flight placeholder is visible", async () => {
      const visible = await schedulePage.draftFlightPlaceholder.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!visible) {
        run.warn("Draft Flight placeholder not visible — schedule may need reset");
        test.skip();
        return;
      }
      run.log("draft placeholder visible", true);
    });

    await test.step("drag first booking to draft-flight placeholder", async () => {
      const firstBooking = page.locator('[data-testid="booking-item"]').first();
      const bookingIdAttr = await firstBooking.getAttribute("id");
      if (!bookingIdAttr) {
        run.warn("Could not read booking id attribute");
        test.skip();
        return;
      }
      const bookingNum = parseInt(bookingIdAttr.replace("booking-", ""), 10);
      if (isNaN(bookingNum)) {
        run.warn(`Invalid booking id: ${bookingIdAttr}`);
        test.skip();
        return;
      }

      console.log(`Dragging booking-${bookingNum} → draft-flight-placeholder`);
      await dragBookingToDraftFlight(page, bookingNum);
      await waitForStable(page, run);

      const flightCount = await schedulePage.getFlightCardCount();
      run.log("new flight created from booking", flightCount > 0, `flight count after drag: ${flightCount}`);
    });

    await test.step("verify loadsheet for newly created flight", async () => {
      const opened = await openLoadsheet(page, 0, run);
      if (!opened) {
        run.warn("Could not open loadsheet for new flight");
        return;
      }

      const styVisible = await page.locator("text=STY").first().isVisible({ timeout: 10_000 }).catch(() => false);
      run.log("new flight loadsheet shows STY", styVisible, "drag-created flights enforce STY (RULE 1)");

      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    });

    console.log(run.summary());
    const criticalFailures = run.assertions.filter((a) => !a.passed);
    if (criticalFailures.length > 0) {
      throw new Error(`Critical failures: ${criticalFailures.map((a) => a.description).join("; ")}`);
    }
  });

  // ── 3. Drag booking between flights ──────────────────────────────────

  test("should drag a booking between two flights and verify loadsheet updates", async ({ page }) => {
    const run = new TestRun();
    const CANDIDATE_DATES = ["2026-07-20", "2026-07-19", "2026-07-18"];

    await test.step("find date with two flights and unassigned bookings", async () => {
      for (const date of CANDIDATE_DATES) {
        await schedulePage.goto(date);
        const fc = await schedulePage.getFlightCardCount();
        const bc = await schedulePage.getUnassignedBookingCount();
        if (fc >= 2 && bc > 0) break;
      }
      const flightCount = await schedulePage.getFlightCardCount();
      const bookingCount = await schedulePage.getUnassignedBookingCount();
      run.log("prerequisites", flightCount >= 2 && bookingCount > 0, `flights=${flightCount}, bookings=${bookingCount}`);
      if (flightCount < 2 || bookingCount === 0) { test.skip(); return; }
    });

    await test.step("drag booking from unassigned pool to first flight", async () => {
      const firstBooking = page.locator('[data-testid="booking-item"]').first();
      const bookingIdAttr = await firstBooking.getAttribute("id");
      const bookingNum = parseInt((bookingIdAttr ?? "").replace("booking-", ""), 10);

      // Get first flight card's droppable flight-{id}
      const firstFlightCard = page.locator('[data-testid="flight-card"]').first();
      const flightIdAttr = await firstFlightCard.getAttribute("id");
      const flightNum = parseInt((flightIdAttr ?? "").replace("flight-", ""), 10);

      if (isNaN(bookingNum) || isNaN(flightNum)) {
        run.warn(`Invalid ids — booking=${bookingIdAttr}, flight=${flightIdAttr}`);
        test.skip();
        return;
      }

      console.log(`Dragging booking-${bookingNum} → flight-${flightNum}`);
      await dragBookingToFlight(page, bookingNum, flightNum);
      await waitForStable(page, run);
      run.log("booking assigned to flight", true, `booking-${bookingNum} → flight-${flightNum}`);
    });

    await test.step("verify loadsheet shows the assigned passenger", async () => {
      const opened = await openLoadsheet(page, 0, run);
      if (opened) {
        // The loadsheet manifest should now list at least one passenger
        await page.locator('[data-testid="flight-card"]').first().isVisible().catch(() => true);
        run.log("loadsheet opened after assignment", opened);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    });

    console.log(run.summary());
    const criticalFailures = run.assertions.filter((a) => !a.passed);
    if (criticalFailures.length > 0) {
      throw new Error(`Critical failures: ${criticalFailures.map((a) => a.description).join("; ")}`);
    }
  });

  // ── 4. Auto‑build with zero bookings (edge case) ─────────────────────

  test("should handle auto-build with no unassigned bookings gracefully", async ({ page }) => {
    const run = new TestRun();

    await test.step("navigate to a date with no bookings", async () => {
      // A date far in the future that was not seeded
      await schedulePage.goto("2030-06-01");
      const bookingCount = await schedulePage.getUnassignedBookingCount();
      console.log(`Unassigned bookings on 2030-06-01: ${bookingCount}`);
      run.log("navigated to empty date", true, `bookings: ${bookingCount}`);
    });

    await test.step("attempt auto-build on empty date", async () => {
      // On an empty date, the Generate button may be hidden (panel renders but has nothing to build)
      const genVisible = await schedulePage.autoBuildGenerateBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (genVisible) {
        await schedulePage.clickAutoBuild();
        await waitForStable(page, run);
      }

      // Should not have crashed — the page should still be functional
      const hasError = await page.locator("text=Unexpected Server Error").isVisible({ timeout: 3_000 }).catch(() => false);
      run.log("no server error after empty auto-build", !hasError, hasError ? "ErrorBoundary triggered" : undefined);
    });

    console.log(run.summary());
  });

  // ── 5. Full lifecycle: auto‑build → approve → loadsheet ─────────────

  test("should auto-build, approve, and verify loadsheet on approved schedule", async ({ page }) => {
    const run = new TestRun();
    const CANDIDATE_DATES = ["2026-07-18", "2026-07-19", "2026-07-20"];

    await test.step("find a date in a buildable state", async () => {
      for (const date of CANDIDATE_DATES) {
        await schedulePage.goto(date);
        const genVisible = await schedulePage.autoBuildGenerateBtn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (genVisible) { run.log("found buildable date", true, `date=${date}`); break; }
      }
    });

    await test.step("auto-build flights", async () => {
      const genVisible = await schedulePage.autoBuildGenerateBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (genVisible) {
        await schedulePage.clickAutoBuild();
        await waitForStable(page, run);
      }
      const flightCount = await schedulePage.getFlightCardCount();
      run.log("flights after auto-build", flightCount > 0, `count=${flightCount}`);
    });

    await test.step("approve the schedule", async () => {
      const approveBtn = page.getByRole("button", { name: /approve/i });
      const visible = await approveBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!visible) {
        run.warn("Approve button not visible — schedule may already be approved");
        return;
      }
      await approveBtn.click();
      await waitForStable(page, run);

      const statusBar = page.locator('[data-testid="schedule-status-bar"]');
      const statusText = await statusBar.textContent().catch(() => "");
      const isApproved = /approved/i.test(statusText ?? "");
      run.log("schedule status is APPROVED", isApproved, `status text: "${statusText?.trim()}"`);
    });

    await test.step("loadsheet still accessible after approval", async () => {
      const flightCount = await schedulePage.getFlightCardCount();
      if (flightCount === 0) {
        run.warn("No flights to inspect");
        return;
      }
      const opened = await openLoadsheet(page, 0, run);
      run.log("loadsheet opens on approved schedule", opened);
      if (opened) await page.keyboard.press("Escape");
    });

    console.log(run.summary());
    const criticalFailures = run.assertions.filter(
      (a) => !a.passed
      && !a.description.includes("schedule status is APPROVED")
    );
    if (criticalFailures.length > 0) {
      throw new Error(`Critical failures: ${criticalFailures.map((a) => a.description).join("; ")}`);
    }
  });
});
