import { type Page } from "@playwright/test";

/**
 * Simulate a drag-and-drop operation using Playwright's mouse API.
 * dnd-kit's PointerSensor listens for pointerdown → pointermove → pointerup
 * events with an activation constraint of 8px distance.
 */
export async function simulateDragDrop(
  page: Page,
  dragSelector: string,
  dropSelector: string
) {
  const dragEl = page.locator(dragSelector).first();
  const dropEl = page.locator(dropSelector).first();

  await dragEl.waitFor({ state: "visible", timeout: 5_000 });
  await dropEl.waitFor({ state: "visible", timeout: 5_000 });

  const dragBox = await dragEl.boundingBox();
  const dropBox = await dropEl.boundingBox();
  if (!dragBox || !dropBox) return;

  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  const endX = dropBox.x + dropBox.width / 2;
  const endY = dropBox.y + dropBox.height / 2;

  // Pointer-down at source
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(150);

  // Move in small steps to satisfy dnd-kit's 8px activation constraint
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + (endX - startX) * (i / steps),
      startY + (endY - startY) * (i / steps),
      { steps: 1 }
    );
    await page.waitForTimeout(40);
  }

  await page.waitForTimeout(100);
  await page.mouse.up();

  // Wait for server response and UI re-render
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
}

/**
 * Drag a booking (by its booking leg passenger ID) onto a flight card (by flight ID).
 */
export async function dragBookingToFlight(
  page: Page,
  bookingLegId: number,
  flightId: number
) {
  const dragSelector = `[id="booking-${bookingLegId}"]`;
  const dropSelector = `[id="flight-${flightId}"]`;
  await simulateDragDrop(page, dragSelector, dropSelector);
}

/**
 * Drag a booking onto the draft flight placeholder to create a new flight.
 */
export async function dragBookingToDraftFlight(page: Page, bookingLegId: number) {
  const dragSelector = `[id="booking-${bookingLegId}"]`;
  const dropSelector = `[id="draft-flight-placeholder"]`;
  await simulateDragDrop(page, dragSelector, dropSelector);
}

/**
 * Drag a flight card to reorder it to a new position in the schedule board.
 */
export async function dragFlightToReorder(
  page: Page,
  flightId: number,
  targetFlightId: number
) {
  const dragSelector = `[id="${flightId}"]`;
  const dropSelector = `[id="${targetFlightId}"]`;
  await simulateDragDrop(page, dragSelector, dropSelector);
}

/**
 * Drag a passenger row from a flight card back to the unassigned pool.
 */
export async function dragPassengerToUnassignPool(
  page: Page,
  passengerRowSelector: string
) {
  const dropSelector = `[id="unassign-pool"]`;
  await simulateDragDrop(page, passengerRowSelector, dropSelector);
}

/**
 * Drag a booking item onto a different flight card to reassign it between flights.
 */
export async function dragBookingBetweenFlights(
  page: Page,
  bookingLegId: number,
  targetFlightId: number
) {
  const dragSelector = `[id="booking-${bookingLegId}"]`;
  const dropSelector = `[id="flight-${targetFlightId}"]`;
  await simulateDragDrop(page, dragSelector, dropSelector);
}
