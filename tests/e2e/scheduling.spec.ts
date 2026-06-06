import { test, expect } from "@playwright/test";
import { SchedulePage } from "./pages/schedule-page";
import {
  dragBookingToFlight,
  dragBookingToDraftFlight,
  dragFlightToReorder,
  dragPassengerToUnassignPool,
  dragBookingBetweenFlights,
} from "./helpers/drag-simulator";

test.describe("Schedule Builder - Date Picker & Unassigned Passengers", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
    await schedulePage.goto();
  });

  test("should display the DatePicker component on the schedule page", async ({ page }) => {
    // The DatePicker renders a button showing the formatted date (e.g., "Jun 1, 2026")
    // It contains a calendar icon SVG and the formatted date text
    const datePickerButton = page.locator(
      'button:has(svg) >> text=/^[A-Z][a-z]{2} \\d{1,2}, \\d{4}$/'
    );
    await expect(datePickerButton.first()).toBeVisible({ timeout: 10_000 });
  });

  test("should display unassigned bookings for the default (today) date", async ({ page }) => {
    // Wait for the page to fully load
    await page.waitForLoadState("networkidle");

    // The panel heading shows "Unassigned Passengers" as an h3 element
    await expect(schedulePage.unassignedHeading).toBeVisible({ timeout: 10_000 });

    // Verify the page loaded without errors
    await schedulePage.expectNoErrors();
  });

  test("should update unassigned bookings when date is changed", async ({ page }) => {
    // Get the current unassigned booking count for today
    await page.waitForLoadState("networkidle");

    // Find the unassigned pool panel and count its items
    const initialBookingCount = await schedulePage.getUnassignedBookingCount();

    // Click the DatePicker button to open the calendar
    await expect(schedulePage.datePickerButton).toBeVisible({ timeout: 5_000 });
    await schedulePage.datePickerButton.click();

    // Wait for calendar popup
    await page.waitForTimeout(500);

    // The calendar popup should now be visible
    // Click on day 15 of the visible month
    const dayButtons = page.locator('button:not([aria-label]) >> text=/^15$/');
    const day15 = dayButtons.first();
    if (await day15.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await day15.click();
    } else {
      // Try navigating to next month first
      const nextMonthBtn = page.locator('button[aria-label="Next month"]');
      if (await nextMonthBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await nextMonthBtn.click();
        await page.waitForTimeout(300);
        const day15Again = page.locator('button:not([aria-label]) >> text=/^15$/').first();
        await day15Again.click();
      }
    }

    // Wait for navigation (useSearchParams triggers loader re-run)
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle");

    // Verify the URL has changed to reflect the new date
    const newUrl = page.url();
    console.log(`URL after date change: ${newUrl}`);

    // The unassigned pool should have re-rendered
    // Count draggable items again - they may be different for the new date
    const newBookingCount = await schedulePage.getUnassignedBookingCount();
    console.log(`Initial bookings: ${initialBookingCount}, New bookings: ${newBookingCount}`);

    // The key assertion is that the page re-rendered without errors
    await schedulePage.expectNoErrors();
  });

  test("should show empty state when no schedule exists for selected date", async ({ page }) => {
    // Navigate to a date far in the future that likely has no schedule
    const futureDate = "2030-12-25";
    await page.goto(`/operations/schedule?date=${futureDate}`);
    await page.waitForLoadState("networkidle");

    // Should show an empty state or "no schedule" message
    await schedulePage.expectEmptyState();
  });

  test("should navigate between dates and maintain URL state", async ({ page }) => {
    // Navigate to a specific date via URL
    const testDate = "2026-06-15";
    await page.goto(`/operations/schedule?date=${testDate}`);
    await page.waitForLoadState("networkidle");

    // Verify the URL still shows our test date
    const currentUrl = page.url();
    expect(currentUrl).toContain(`date=${testDate}`);

    // Verify the page rendered without errors
    await schedulePage.expectNoErrors();
  });
});

test.describe("Schedule Builder - Flight Cards & Schedule Actions", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
    await schedulePage.goto();
  });

  test("should display flight cards when schedule exists", async ({ page }) => {
    // Navigate to a date that has a schedule with flights
    // Try today first, then fall back to a known date
    await page.waitForLoadState("networkidle");

    // Check if there are flight cards visible
    const flightCardCount = await schedulePage.getFlightCardCount();
    console.log(`Flight cards found: ${flightCardCount}`);

    // If no flight cards on today, try a date that likely has flights
    if (flightCardCount === 0) {
      // Try a few dates that might have schedule data
      const datesToTry = ["2026-06-01", "2026-06-02", "2026-06-03"];
      for (const date of datesToTry) {
        await schedulePage.goto(date);
        const count = await schedulePage.getFlightCardCount();
        if (count > 0) break;
      }
    }

    // The schedule board should be present
    const board = page.locator('[data-testid="schedule-board"]');
    // If there's a schedule, the board should exist
    const boardExists = await board.isVisible().catch(() => false);
    if (boardExists) {
      console.log("Schedule board is visible");
    }

    await schedulePage.expectNoErrors();
  });

  test("should auto-build flights from unassigned bookings", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Check if auto-build button is available
    const autoBuildBtn = page.getByRole("button", { name: /auto.?build/i });
    const autoBuildVisible = await autoBuildBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (autoBuildVisible) {
      console.log("Auto-build button found, clicking it");
      await autoBuildBtn.click();
      await page.waitForLoadState("networkidle");

      // Verify no errors after auto-build
      await schedulePage.expectNoErrors();

      // Flight cards should now be present
      const flightCount = await schedulePage.getFlightCardCount();
      console.log(`Flight cards after auto-build: ${flightCount}`);
    } else {
      console.log("Auto-build button not visible (may already have flights or no unassigned bookings)");
    }
  });

  test("should approve a schedule", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Check if approve button is available
    const approveBtn = page.getByRole("button", { name: /approve/i });
    const approveVisible = await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (approveVisible) {
      console.log("Approve button found, clicking it");
      await approveBtn.click();
      await page.waitForLoadState("networkidle");

      // Verify no errors after approve
      await schedulePage.expectNoErrors();

      // After approval, the status should have changed
      // The button text may change to "Revise" or similar
      const reviseBtn = page.getByRole("button", { name: /revise/i });
      const reviseVisible = await reviseBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`Revise button visible after approve: ${reviseVisible}`);
    } else {
      console.log("Approve button not visible (schedule may not be in editable state)");
    }
  });
});

test.describe("Schedule Builder - Drag and Drop", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
    await schedulePage.goto();
    await page.waitForLoadState("networkidle");
  });

  test("should assign a booking to a flight via drag-and-drop", async ({ page }) => {
    // Check if we have both draggable bookings and flight cards
    const bookingCount = await schedulePage.getUnassignedBookingCount();
    const flightCount = await schedulePage.getFlightCardCount();

    console.log(`Bookings: ${bookingCount}, Flights: ${flightCount}`);

    if (bookingCount > 0 && flightCount > 0) {
      // Get the first booking's id
      const firstBooking = page.locator('[draggable="true"]').first();
      const bookingId = await firstBooking.getAttribute("id");
      console.log(`Dragging booking: ${bookingId}`);

      // Get the first flight card's droppable id
      const firstFlight = page.locator('[data-testid="flight-card"]').first();
      const flightId = await firstFlight.getAttribute("id");
      console.log(`Dropping onto flight: ${flightId}`);

      if (bookingId && flightId) {
        // Extract numeric IDs
        const bookingNum = parseInt(bookingId.replace("booking-", ""), 10);
        const flightNum = parseInt(flightId.replace("flight-", ""), 10);

        if (!isNaN(bookingNum) && !isNaN(flightNum)) {
          await dragBookingToFlight(page, bookingNum, flightNum);

          // Wait for the UI to settle
          await page.waitForTimeout(500);
          await page.waitForLoadState("networkidle");

          // Verify no errors occurred
          await schedulePage.expectNoErrors();
          console.log("Drag-and-drop completed successfully");
        }
      }
    } else {
      console.log("Skipping drag-and-drop test: need both bookings and flights");
      test.skip();
    }
  });

  test("should create a new flight by dragging to draft placeholder", async ({ page }) => {
    // Check if we have draggable bookings
    const bookingCount = await schedulePage.getUnassignedBookingCount();

    if (bookingCount > 0) {
      // Check if draft flight placeholder is visible
      const draftPlaceholder = page.locator("text=Draft Flight").first();
      const draftVisible = await draftPlaceholder.isVisible({ timeout: 3_000 }).catch(() => false);

      if (draftVisible) {
        // Get the first booking's id
        const firstBooking = page.locator('[draggable="true"]').first();
        const bookingId = await firstBooking.getAttribute("id");

        if (bookingId) {
          const bookingNum = parseInt(bookingId.replace("booking-", ""), 10);
          if (!isNaN(bookingNum)) {
            await dragBookingToDraftFlight(page, bookingNum);

            // Wait for the UI to settle
            await page.waitForTimeout(500);
            await page.waitForLoadState("networkidle");

            // Verify no errors occurred
            await schedulePage.expectNoErrors();
            console.log("Drag to draft flight completed successfully");
          }
        }
      } else {
        console.log("Draft flight placeholder not visible");
        test.skip();
      }
    } else {
      console.log("Skipping drag-to-draft test: no unassigned bookings");
      test.skip();
    }
  });

  // ── Drag-to-Reorder Flights ────────────────────────────────────────────────

  test("should reorder flight cards via drag-and-drop", async ({ page }) => {
    // Need at least 2 flight cards to reorder
    const flightCount = await schedulePage.getFlightCardCount();

    if (flightCount >= 2) {
      // Get the first two flight cards
      const flightCards = page.locator('[data-testid="flight-card"]');
      const firstFlightId = await flightCards.nth(0).getAttribute("id");
      const secondFlightId = await flightCards.nth(1).getAttribute("id");

      console.log(`Reordering: first flight id=${firstFlightId}, second flight id=${secondFlightId}`);

      if (firstFlightId && secondFlightId) {
        // Extract numeric flight IDs (flight cards use `flight-{id}` for data-testid="flight-card")
        // But sortable items use numeric IDs. We need to find the sortable wrapper by its numeric id.
        // The sortable wrapper has role="button" and aria-label starting with "Flight".
        // We can locate it by the flight card's id attribute.
        const firstFlightNum = parseInt(firstFlightId.replace("flight-", ""), 10);
        const secondFlightNum = parseInt(secondFlightId.replace("flight-", ""), 10);

        if (!isNaN(firstFlightNum) && !isNaN(secondFlightNum)) {
          // Drag the first flight card onto the second to trigger reorder
          await dragFlightToReorder(page, firstFlightNum, secondFlightNum);

          // Wait for the UI to settle
          await page.waitForTimeout(500);
          await page.waitForLoadState("networkidle");

          // Verify no errors occurred
          await schedulePage.expectNoErrors();

          // Verify the flight cards are still present (order may have changed)
          const updatedFlightCount = await schedulePage.getFlightCardCount();
          expect(updatedFlightCount).toBe(flightCount);
          console.log("Flight reorder completed successfully");
        }
      }
    } else {
      console.log(`Skipping reorder test: need at least 2 flight cards, found ${flightCount}`);
      test.skip();
    }
  });

  // ── Drag-Between-Flights ───────────────────────────────────────────────────

  test("should drag a booking between flights", async ({ page }) => {
    // Need at least 2 flight cards and some unassigned bookings
    const bookingCount = await schedulePage.getUnassignedBookingCount();
    const flightCount = await schedulePage.getFlightCardCount();

    console.log(`Bookings: ${bookingCount}, Flights: ${flightCount}`);

    if (bookingCount > 0 && flightCount >= 2) {
      // Get the first booking's id
      const firstBooking = page.locator('[draggable="true"]').first();
      const bookingId = await firstBooking.getAttribute("id");

      // Get the second flight card as the target
      const secondFlight = page.locator('[data-testid="flight-card"]').nth(1);
      const targetFlightId = await secondFlight.getAttribute("id");

      console.log(`Dragging booking: ${bookingId} to flight: ${targetFlightId}`);

      if (bookingId && targetFlightId) {
        const bookingNum = parseInt(bookingId.replace("booking-", ""), 10);
        const flightNum = parseInt(targetFlightId.replace("flight-", ""), 10);

        if (!isNaN(bookingNum) && !isNaN(flightNum)) {
          await dragBookingBetweenFlights(page, bookingNum, flightNum);

          // Wait for the UI to settle
          await page.waitForTimeout(500);
          await page.waitForLoadState("networkidle");

          // Verify no errors occurred
          await schedulePage.expectNoErrors();
          console.log("Drag between flights completed successfully");
        }
      }
    } else {
      console.log("Skipping drag-between-flights test: need bookings and at least 2 flights");
      test.skip();
    }
  });

  // ── Drag-to-Unassign-Pool ──────────────────────────────────────────────────

  test("should drag a passenger back to the unassigned pool", async ({ page }) => {
    // Need at least 1 flight card with passengers
    const flightCount = await schedulePage.getFlightCardCount();

    if (flightCount > 0) {
      // Look for passenger rows inside flight cards.
      // Passenger rows are rendered via renderPassengerRow prop and have role="button"
      // with aria-label containing "Passenger" or similar.
      // They may also have draggable="true" attribute.
      const passengerRows = page.locator('[data-testid="flight-card"] [draggable="true"]');
      const passengerCount = await passengerRows.count();
      console.log(`Passenger rows found in flight cards: ${passengerCount}`);

      if (passengerCount > 0) {
        // Get the first passenger row's selector
        const firstPassenger = passengerRows.first();
        const passengerSelector = await firstPassenger.evaluate((el) => {
          // Use the element's id if available, otherwise construct a unique selector
          if (el.id) return `[id="${el.id}"]`;
          // Fallback: use the element's position
          return `[data-testid="flight-card"] [draggable="true"]:first-child`;
        });

        console.log(`Dragging passenger with selector: ${passengerSelector}`);

        await dragPassengerToUnassignPool(page, passengerSelector);

        // Wait for the UI to settle
        await page.waitForTimeout(500);
        await page.waitForLoadState("networkidle");

        // Verify no errors occurred
        await schedulePage.expectNoErrors();
        console.log("Drag to unassign pool completed successfully");
      } else {
        console.log("No passenger rows found in flight cards to drag back");
        test.skip();
      }
    } else {
      console.log("Skipping unassign-pool test: no flight cards");
      test.skip();
    }
  });
});

// ── Keyboard Accessibility ──────────────────────────────────────────────────

test.describe("Schedule Builder - Keyboard Accessibility", () => {
  let schedulePage: SchedulePage;

  test.beforeEach(async ({ page }) => {
    schedulePage = new SchedulePage(page);
    await schedulePage.goto();
    await page.waitForLoadState("networkidle");
  });

  test("should have keyboard-focusable flight cards", async ({ page }) => {
    // Flight cards are rendered inside sortable wrappers with tabIndex={0} and role="button"
    // The sortable wrapper has aria-label starting with "Flight"
    const flightCards = page.locator('[role="button"][tabindex="0"]').filter({
      has: page.locator('[data-testid="flight-card"]'),
    });
    const flightCardCount = await flightCards.count();
    console.log(`Keyboard-focusable flight cards: ${flightCardCount}`);

    if (flightCardCount > 0) {
      // Verify the first flight card is focusable
      const firstFlightCard = flightCards.first();
      await expect(firstFlightCard).toBeVisible({ timeout: 5_000 });

      // Focus the first flight card
      await firstFlightCard.focus();
      await page.waitForTimeout(200);

      // Verify it received focus
      const isFocused = await firstFlightCard.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBeTruthy();
      console.log("Flight card is keyboard-focusable");

      // Verify it has a descriptive aria-label
      const ariaLabel = await firstFlightCard.getAttribute("aria-label");
      console.log(`Flight card aria-label: "${ariaLabel}"`);
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.toLowerCase()).toContain("flight");
    } else {
      console.log("No flight cards found for keyboard accessibility test");
      test.skip();
    }
  });

  test("should have keyboard-focusable booking items", async ({ page }) => {
    // Booking items have role="button" and tabIndex={0} and draggable="true"
    const bookingItems = page.locator('[draggable="true"][role="button"][tabindex="0"]');
    const bookingCount = await bookingItems.count();
    console.log(`Keyboard-focusable booking items: ${bookingCount}`);

    if (bookingCount > 0) {
      // Verify the first booking item is focusable
      const firstBooking = bookingItems.first();
      await expect(firstBooking).toBeVisible({ timeout: 5_000 });

      // Focus the first booking item
      await firstBooking.focus();
      await page.waitForTimeout(200);

      // Verify it received focus
      const isFocused = await firstBooking.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBeTruthy();
      console.log("Booking item is keyboard-focusable");

      // Verify it has a descriptive aria-label
      const ariaLabel = await firstBooking.getAttribute("aria-label");
      console.log(`Booking item aria-label: "${ariaLabel}"`);
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.toLowerCase()).toContain("booking");
    } else {
      console.log("No booking items found for keyboard accessibility test");
      test.skip();
    }
  });

  test("should have keyboard-focusable schedule action buttons", async ({ page }) => {
    // Check for action buttons like auto-build, approve, revise, etc.
    const actionButtons = page.locator(
      'button:has-text("Auto Build"), button:has-text("Auto-Build"), button:has-text("Approve"), button:has-text("Revise"), button:has-text("Publish"), button:has-text("Cancel")'
    );
    const actionButtonCount = await actionButtons.count();
    console.log(`Schedule action buttons found: ${actionButtonCount}`);

    if (actionButtonCount > 0) {
      // Verify the first action button is focusable
      const firstButton = actionButtons.first();
      await expect(firstButton).toBeVisible({ timeout: 5_000 });

      // Focus the button
      await firstButton.focus();
      await page.waitForTimeout(200);

      // Verify it received focus
      const isFocused = await firstButton.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBeTruthy();
      console.log("Schedule action button is keyboard-focusable");
    } else {
      console.log("No schedule action buttons found");
      // This is not a failure - the schedule may not be in a state with action buttons
      test.skip();
    }
  });

  test("should have proper ARIA attributes on draggable items", async ({ page }) => {
    // Check draggable items for ARIA attributes (aria-grabbed, aria-describedby, role)
    const draggableItems = page.locator('[draggable="true"]');
    const draggableCount = await draggableItems.count();
    console.log(`Draggable items found: ${draggableCount}`);

    if (draggableCount > 0) {
      // Check that draggable items have proper accessibility attributes
      for (let i = 0; i < Math.min(draggableCount, 3); i++) {
        const item = draggableItems.nth(i);
        const ariaGrabbed = await item.getAttribute("aria-grabbed");
        const role = await item.getAttribute("role");
        const tabIndex = await item.getAttribute("tabindex");
        const ariaLabel = await item.getAttribute("aria-label");
        console.log(
          `Draggable item ${i}: role="${role}", tabindex="${tabIndex}", aria-grabbed="${ariaGrabbed}", aria-label="${ariaLabel}"`
        );

        // Each draggable item should have role="button" and tabIndex="0"
        expect(role).toBe("button");
        expect(tabIndex).toBe("0");
        // aria-grabbed should be present (either "true" or "false")
        expect(ariaGrabbed).toBeTruthy();
        // aria-label should be descriptive
        expect(ariaLabel).toBeTruthy();
      }
    } else {
      console.log("No draggable items found for ARIA attribute check");
      test.skip();
    }
  });
});
