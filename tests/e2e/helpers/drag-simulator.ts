import { type Page } from "@playwright/test";

/**
 * Simulate a drag-and-drop operation using Playwright's mouse API.
 * This dispatches pointer events that dnd-kit's PointerSensor listens for.
 *
 * @param page - Playwright Page instance
 * @param dragSelector - Playwright selector string for the element to drag
 * @param dropSelector - Playwright selector string for the drop target element
 */
/**
 * Perform a drag-and-drop operation using Playwright's built-in dragTo.
 * dnd-kit's PointerSensor listens for native pointer events, which
 * Playwright's dragTo dispatches correctly.
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

  await dragEl.dragTo(dropEl, { force: true });

  // Wait for server response and UI re-render
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
}

/**
 * Drag a booking (by its booking leg ID) onto a flight card (by flight ID).
 *
 * @param page - Playwright Page instance
 * @param bookingLegId - The booking leg ID (used in the draggable id `booking-{id}`)
 * @param flightId - The flight ID (used in the droppable id)
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
 *
 * @param page - Playwright Page instance
 * @param bookingLegId - The booking leg ID (used in the draggable id `booking-{id}`)
 */
export async function dragBookingToDraftFlight(page: Page, bookingLegId: number) {
  const dragSelector = `[id="booking-${bookingLegId}"]`;
  const dropSelector = `[id="draft-flight-placeholder"]`;
  await simulateDragDrop(page, dragSelector, dropSelector);
}

/**
 * Drag a flight card to reorder it to a new position in the schedule board.
 * Flight cards use useSortable with numeric IDs (no prefix).
 *
 * @param page - Playwright Page instance
 * @param flightId - The numeric flight ID to drag
 * @param targetFlightId - The numeric flight ID of the target position (drop before/after)
 */
export async function dragFlightToReorder(
  page: Page,
  flightId: number,
  targetFlightId: number
) {
  // Sortable flight cards use numeric IDs (no prefix) via useSortable.
  // We locate them by their aria-label which starts with "Flight".
  const dragSelector = `[id="${flightId}"]`;
  const dropSelector = `[id="${targetFlightId}"]`;
  await simulateDragDrop(page, dragSelector, dropSelector);
}

/**
 * Drag a passenger row from a flight card back to the unassigned pool.
 * The unassign pool droppable has id="unassign-pool".
 *
 * @param page - Playwright Page instance
 * @param passengerRowSelector - Selector for the passenger row element to drag
 */
export async function dragPassengerToUnassignPool(
  page: Page,
  passengerRowSelector: string
) {
  const dropSelector = `[id="unassign-pool"]`;
  await simulateDragDrop(page, passengerRowSelector, dropSelector);
}

/**
 * Drag a booking item (by its booking leg ID) onto a different flight card
 * to reassign it between flights.
 *
 * @param page - Playwright Page instance
 * @param bookingLegId - The booking leg ID (used in the draggable id `booking-{id}`)
 * @param targetFlightId - The target flight ID (used in the droppable id `flight-{id}`)
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
